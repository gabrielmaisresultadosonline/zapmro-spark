#!/usr/bin/env bash
# ============================================================================
#  ZapmPro - Diagnóstico de números de WhatsApp (multi-número por cadastro)
# ----------------------------------------------------------------------------
#  Descobre POR QUE um dos números do mesmo cadastro não envia nem recebe.
#  Roda tudo na VPS, somente LEITURA (não altera nada no banco).
#
#  Uso:
#     cd ~/zapmro
#     chmod +x deploy/diagnosticar-numeros.sh
#     ./deploy/diagnosticar-numeros.sh                 # todos os cadastros
#     ./deploy/diagnosticar-numeros.sh email@dono.com  # só um cadastro
#
#  O que ele checa, em ordem:
#   1) Migração 088 aplicada (coluna whatsapp_number_id nas tabelas)
#   2) Números cadastrados + credenciais preenchidas (token/phone_number_id)
#   3) Contatos e mensagens por número (quem está zerado)
#   4) Mensagens órfãs (sem whatsapp_number_id) - sintoma de dado antigo
#   5) Meta Cloud API: token válido? webhook assinado na WABA?
#   6) Logs recentes das Edge Functions com o phone_number_id do número
# ============================================================================
set -uo pipefail

FILTRO_EMAIL="${1:-}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$RAIZ/deploy/postgres-stack/.env"

c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*"; }
titulo() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

[ -f "$ENV_FILE" ] || { c_err "Não encontrei $ENV_FILE (rode na pasta do projeto na VPS)."; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

DB="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT:-5432}/${POSTGRES_DB:-postgres}"
q()  { psql "$DB" -v ON_ERROR_STOP=0 -X -q -c "$1" 2>&1; }
q1() { psql "$DB" -v ON_ERROR_STOP=0 -X -tAc "$1" 2>/dev/null; }

command -v psql >/dev/null || { c_err "psql não instalado: sudo apt-get install -y postgresql-client"; exit 1; }
[ -n "$(q1 'select 1')" ] || { c_err "Não consegui conectar no banco (container zapmro-db está de pé?)"; exit 1; }

# ---------------------------------------------------------------------------
# Onde está o e-mail neste banco? Instalações diferentes guardam em lugares
# diferentes (coluna auth.users.email, metadados, ou nem existe). Detectamos
# em runtime para nunca abortar os blocos seguintes com "column does not exist".
EMAIL_EXPR="null::text"
if [ "$(q1 "select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email'")" = "1" ]; then
  EMAIL_EXPR="p.email"
elif [ "$(q1 "select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='raw_user_meta_data'")" = "1" ]; then
  EMAIL_EXPR="(p.raw_user_meta_data->>'email')"
  c_warn "  auth.users.email não existe; usando raw_user_meta_data->>'email'"
else
  c_warn "  Não há coluna de e-mail em auth.users; o filtro por e-mail será ignorado."
fi

titulo "0) Versão que está rodando de verdade"
GIT_COMMIT="$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo '?')"
echo "  commit do repositório: $GIT_COMMIT"
FN_HOST="$RAIZ/supabase/functions/meta-whatsapp-crm/index.ts"
if [ -f "$FN_HOST" ]; then
  echo "  hash no host:      $(sha256sum "$FN_HOST" | cut -c1-16)"
fi
if docker ps --format '{{.Names}}' | grep -q '^zapmro-functions$'; then
  HASH_CONTAINER="$(docker exec zapmro-functions sha256sum /home/deno/functions/meta-whatsapp-crm/index.ts 2>/dev/null | cut -c1-16)"
  echo "  hash no container: ${HASH_CONTAINER:-nao consegui ler}"
  echo "  container iniciado em: $(docker inspect -f '{{.State.StartedAt}}' zapmro-functions 2>/dev/null)"
  if [ -f "$FN_HOST" ] && [ -n "${HASH_CONTAINER:-}" ]; then
    if [ "$(sha256sum "$FN_HOST" | cut -c1-16)" = "$HASH_CONTAINER" ]; then
      c_ok "  OK  container está com o MESMO código do repositório"
    else
      c_err "  DIVERGENTE  o container roda código antigo -> docker compose -f deploy/postgres-stack/docker-compose.yml up -d --force-recreate functions"
    fi
  fi
fi

# ---------------------------------------------------------------------------
titulo "1) Migração de isolamento por número (088)"
for t in crm_contacts crm_messages; do
  tem="$(q1 "select count(*) from information_schema.columns where table_schema='public' and table_name='$t' and column_name='whatsapp_number_id'")"
  if [ "${tem:-0}" = "1" ]; then c_ok "  OK  $t.whatsapp_number_id existe"
  else c_err "  FALTA  $t.whatsapp_number_id -> rode ./deploy/atualizar.sh para aplicar o SQL 088"; fi
done

IDX_OK="$(q1 "select count(*) from pg_indexes where schemaname='public' and indexname='crm_contacts_wa_user_number_uidx'")"
if [ "${IDX_OK:-0}" = "1" ]; then
  c_ok "  OK  índice único não-parcial (089) presente — upsert de contato funciona"
else
  c_err "  FALTA  índice crm_contacts_wa_user_number_uidx (SQL 089) -> mensagens recebidas falham com erro de ON CONFLICT"
fi

# ---------------------------------------------------------------------------
titulo "2) Números cadastrados e credenciais"
FILTRO_SQL="true"
[ -n "$FILTRO_EMAIL" ] && FILTRO_SQL="lower(coalesce($EMAIL_EXPR,'')) = lower('$FILTRO_EMAIL')"


q "
select
  ${EMAIL_EXPR}                                                as cadastro,
  coalesce(n.label,'(sem nome)')                         as numero,
  coalesce(n.meta_display_phone_number,'-')              as telefone,
  coalesce(n.meta_phone_number_id,'!! VAZIO')            as phone_number_id,
  coalesce(n.meta_waba_id,'!! VAZIO')                    as waba_id,
  case when coalesce(n.meta_access_token,'') = '' then '!! SEM TOKEN'
       else 'token ok ('||length(n.meta_access_token)||' chars)' end as token,
  n.is_active                                            as ativo,
  n.id                                                   as numero_id
from public.crm_whatsapp_numbers n
join auth.users p on p.id = n.user_id
where $FILTRO_SQL
order by ${EMAIL_EXPR}, n.created_at;
"

# ---------------------------------------------------------------------------
titulo "3) Volume por número (quem está zerado)"
q "
select
  ${EMAIL_EXPR}                                       as cadastro,
  coalesce(n.label, n.meta_display_phone_number,'(sem nome)') as numero,
  (select count(*) from public.crm_contacts c
     where c.whatsapp_number_id = n.id)         as contatos,
  (select count(*) from public.crm_messages m
     where m.whatsapp_number_id = n.id)         as mensagens,
  (select count(*) from public.crm_messages m
     where m.whatsapp_number_id = n.id and m.direction = 'inbound')  as recebidas,
  (select count(*) from public.crm_messages m
     where m.whatsapp_number_id = n.id and m.direction = 'outbound') as enviadas,
  (select max(m.created_at) from public.crm_messages m
     where m.whatsapp_number_id = n.id)         as ultima_mensagem
from public.crm_whatsapp_numbers n
join auth.users p on p.id = n.user_id
where $FILTRO_SQL
order by ${EMAIL_EXPR}, mensagens desc;
"

titulo "4) Registros órfãos (sem número atribuído = dado antigo)"
q "
select
  ${EMAIL_EXPR} as cadastro,
  (select count(*) from public.crm_contacts c
     where c.user_id = p.id and c.whatsapp_number_id is null) as contatos_orfaos,
  (select count(*) from public.crm_messages m
     where m.user_id = p.id and m.whatsapp_number_id is null)  as mensagens_orfas
from auth.users p
where $FILTRO_SQL;
"

# ---------------------------------------------------------------------------
titulo "5) Meta Cloud API: token e assinatura do webhook"
if ! command -v jq >/dev/null; then c_warn "  jq não instalado (sudo apt-get install -y jq) - pulando"; else
  while IFS='|' read -r email label pnid waba token; do
    [ -z "${pnid// }" ] && continue
    printf '\n  -> %s / %s (phone_number_id=%s)\n' "$email" "${label:-sem nome}" "$pnid"
    if [ -z "${token// }" ]; then c_err "     SEM TOKEN: nada envia nem recebe. Recadastre o número no CRM."; continue; fi

    r="$(curl -s -m 20 "https://graph.facebook.com/v21.0/${pnid}?fields=display_phone_number,verified_name,quality_rating,platform_type,throughput" -H "Authorization: Bearer ${token}")"
    if echo "$r" | jq -e '.error' >/dev/null 2>&1; then
      c_err "     TOKEN/ID INVÁLIDO: $(echo "$r" | jq -r '.error.message')"
      continue
    fi
    c_ok "     número visível na Meta: $(echo "$r" | jq -r '.display_phone_number') ($(echo "$r" | jq -r '.verified_name')) qualidade=$(echo "$r" | jq -r '.quality_rating')"

    if [ -n "${waba// }" ]; then
      s="$(curl -s -m 20 "https://graph.facebook.com/v21.0/${waba}/subscribed_apps" -H "Authorization: Bearer ${token}")"
      if echo "$s" | jq -e '.error' >/dev/null 2>&1; then
        c_warn "     não consegui ler subscribed_apps: $(echo "$s" | jq -r '.error.message')"
      elif [ "$(echo "$s" | jq '.data | length')" = "0" ]; then
        c_err "     WEBHOOK NÃO ASSINADO nesta WABA -> é por isso que não RECEBE mensagem."
        echo   "       corrigir: curl -X POST 'https://graph.facebook.com/v21.0/${waba}/subscribed_apps' -H 'Authorization: Bearer <TOKEN>'"
      else
        c_ok "     webhook assinado por: $(echo "$s" | jq -r '[.data[].whatsapp_business_api_data.name] | join(\", \")')"
      fi
    else
      c_warn "     meta_waba_id vazio: não consigo checar o webhook (preencha no CRM)."
    fi
  done < <(psql "$DB" -X -tA -F'|' -c "
      select ${EMAIL_EXPR}, coalesce(n.label,''), coalesce(n.meta_phone_number_id,''),
             coalesce(n.meta_waba_id,''), coalesce(n.meta_access_token,'')
      from public.crm_whatsapp_numbers n
      join auth.users p on p.id = n.user_id
      where $FILTRO_SQL" 2>/dev/null)
fi

# ---------------------------------------------------------------------------
titulo "6) Logs das Edge Functions (separando ANTES e DEPOIS do deploy)"
if docker ps --format '{{.Names}}' | grep -q '^zapmro-functions$'; then
  INICIO_CONTAINER="$(docker inspect -f '{{.State.StartedAt}}' zapmro-functions 2>/dev/null)"
  echo "  container iniciado em: ${INICIO_CONTAINER:-desconhecido}"
  echo
  c_warn "  --- LOGS ANTIGOS (antes deste container subir; erros aqui NÃO valem mais) ---"
  docker logs --until "${INICIO_CONTAINER:-1h}" zapmro-functions 2>&1 \
    | grep -iE 'webhook|phone_number_id|ON CONFLICT|error' | tail -15 \
    || echo "  (sem logs antigos)"
  echo
  c_ok "  --- LOGS DA VERSÃO ATUAL (é isso que importa) ---"
  docker logs --since "${INICIO_CONTAINER:-10m}" zapmro-functions 2>&1 \
    | grep -iE 'webhook|phone_number_id|whatsapp_number|ON CONFLICT|re-engagement|error' \
    | tail -60 || c_warn "  nenhuma linha relevante desde o start"
  echo
  c_warn "  Teste ao vivo (mande uma mensagem para o número parado enquanto observa):"
  echo   "     docker logs -f --since 1m zapmro-functions | grep -iE 'webhook|phone_number_id|ON CONFLICT|error'"
else
  c_warn "  container zapmro-functions não está rodando: docker compose -f deploy/postgres-stack/docker-compose.yml up -d functions"
fi


titulo "Como ler o resultado"
cat <<'FIM'
  * SEM TOKEN / phone_number_id VAZIO   -> credencial do 2º número não foi salva. Recadastre no CRM.
  * TOKEN/ID INVÁLIDO                   -> token expirou ou pertence a outra WABA (gere token permanente).
  * WEBHOOK NÃO ASSINADO                -> o número existe mas a Meta não entrega nada: assine subscribed_apps
                                           e confirme a URL de callback no app da Meta.
  * mensagens = 0 e nada nos logs        -> a Meta não está chamando o webhook (item acima).
  * mensagens = 0 mas logs mostram POST  -> chegou e falhou na resolução: veja a linha de erro exibida no item 6.
  * mensagens_orfas > 0                  -> dados antigos sem número: rode ./deploy/atualizar.sh (SQL 088 faz o backfill).
FIM
