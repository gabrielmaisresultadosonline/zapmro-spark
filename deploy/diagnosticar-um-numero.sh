#!/usr/bin/env bash
# ============================================================================
#  ZapmPro - Diagnóstico de UM número específico (o que "não recebe nada")
# ----------------------------------------------------------------------------
#  Somente LEITURA. Não altera banco nem Meta.
#
#  Uso na VPS:
#     cd ~/zapmro
#     chmod +x deploy/diagnosticar-um-numero.sh
#     ./deploy/diagnosticar-um-numero.sh 5567987530044
#     ./deploy/diagnosticar-um-numero.sh 6798753004
#     ./deploy/diagnosticar-um-numero.sh edwindacruz@gmail.com
#
#  Aceita: telefone (com ou sem DDI/máscara), phone_number_id ou e-mail do dono.
#
#  Checa, nessa ordem:
#   1) O número existe no cadastro e tem credenciais?
#   2) A Meta reconhece o phone_number_id + token? (name_status / platform_type)
#   3) O webhook está assinado NESSA WABA e com os campos certos?
#   4) A URL de callback do app aponta para esta VPS?
#   5) Volume de mensagens e último recebimento
#   6) Modo escuta: mostra em tempo real se a Meta chama o webhook
# ============================================================================
set -uo pipefail

# Blindagem contra paginador: se a saída for um terminal, re-executa gravando em
# arquivo e ecoando com "cat" (nenhum less/more pode capturar a tela).
if [ -t 1 ] && [ -z "${ZAPMRO_SEM_PAGER:-}" ]; then
  LOG="/tmp/zapmro-diagnostico-$(date +%Y%m%d-%H%M%S).log"
  export ZAPMRO_SEM_PAGER=1 PAGER=cat PSQL_PAGER=cat GIT_PAGER=cat SYSTEMD_PAGER=cat LESS=FRX
  "$0" "$@" 2>&1 | tee "$LOG" | cat
  st=${PIPESTATUS[0]}
  printf '\nsaída completa também salva em: %s\n' "$LOG"
  exit "$st"
fi
export PAGER=cat PSQL_PAGER=cat LESS=FRX

ALVO="${1:-}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$RAIZ/deploy/postgres-stack/.env"
SECRETS_FILE="$RAIZ/deploy/postgres-stack/secrets.env"

c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*"; }
titulo() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

[ -n "$ALVO" ] || { c_err "Informe telefone, phone_number_id ou e-mail. Ex: ./deploy/diagnosticar-um-numero.sh 5567987530044"; exit 1; }
[ -f "$ENV_FILE" ] || { c_err "Não encontrei $ENV_FILE (rode dentro da pasta do projeto na VPS)."; exit 1; }
command -v psql >/dev/null || { c_err "psql ausente: sudo apt-get install -y postgresql-client"; exit 1; }
command -v jq   >/dev/null || c_warn "jq ausente (sudo apt-get install -y jq) — as checagens da Meta ficarão limitadas."

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
# as chaves das integracoes (Meta, Google, SMTP...) moram no secrets.env,
# lido normalmente so pelo container "functions" — aqui tambem precisamos delas.
[ -f "$SECRETS_FILE" ] && . "$SECRETS_FILE"
set +a
# fallback: se PUBLIC_API_URL nao existir, deriva do site publico
: "${PUBLIC_API_URL:=${PUBLIC_FUNCTIONS_URL:-${APP_BASE_URL:-${SITE_URL:-}}}}"
DB="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT:-5432}/${POSTGRES_DB:-postgres}"
# sem paginador: o less estava engolindo a saída (tela de "~" e "(END)")
export PAGER=cat PSQL_PAGER=cat
q()  { psql "$DB" -v ON_ERROR_STOP=0 -X -q -P pager=off -c "$1" 2>&1; }
q1() { psql "$DB" -v ON_ERROR_STOP=0 -X -tA -P pager=off -c "$1" 2>/dev/null; }
[ -n "$(q1 'select 1')" ] || { c_err "Sem conexão com o banco (container zapmro-db de pé?)"; exit 1; }

# e-mail pode estar em auth.users.email ou nos metadados — detecta em runtime
EMAIL_EXPR="null::text"
if [ "$(q1 "select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email'")" = "1" ]; then
  EMAIL_EXPR="u.email"
elif [ "$(q1 "select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='raw_user_meta_data'")" = "1" ]; then
  EMAIL_EXPR="(u.raw_user_meta_data->>'email')"
fi

SOMENTE_DIGITOS="$(printf '%s' "$ALVO" | tr -cd '0-9')"
# casa pelos ÚLTIMOS 8 dígitos: tolera DDI, 9º dígito, máscara e dígito digitado errado
SUFIXO="$(printf '%s' "$SOMENTE_DIGITOS" | tail -c 9)"

# a caixa pode estar só em crm_whatsapp_numbers (multi-número) OU ainda em crm_settings (legado)
LEGADO_OK="$(q1 "select count(*) from information_schema.columns where table_schema='public' and table_name='crm_settings' and column_name='meta_phone_number_id'")"
if [ "$LEGADO_OK" = "1" ]; then
  UNIAO="
    union all
    select null::text, s.user_id, 'caixa legada (crm_settings)'::text,
           coalesce(s.meta_display_phone_number,''), coalesce(s.meta_phone_number_id,''),
           coalesce(s.meta_waba_id,''), coalesce(s.meta_access_token,''), true, s.updated_at
    from public.crm_settings s
    where coalesce(s.meta_phone_number_id,'') <> ''
      and not exists (select 1 from public.crm_whatsapp_numbers w
                      where w.user_id = s.user_id
                        and w.meta_phone_number_id = s.meta_phone_number_id)"
else
  UNIAO=""
fi

CTE="
with caixas as (
  select n.id::text as nid, n.user_id, coalesce(n.label,'(sem nome)')::text as label,
         coalesce(n.meta_display_phone_number,'') as fone, coalesce(n.meta_phone_number_id,'') as pnid,
         coalesce(n.meta_waba_id,'') as waba, coalesce(n.meta_access_token,'') as token,
         n.is_active as ativo, n.created_at as quando
  from public.crm_whatsapp_numbers n
  $UNIAO
)"

FILTRO="(
     c.pnid = '$ALVO'
  or ( '$SUFIXO' <> '' and regexp_replace(c.fone, '[^0-9]', '', 'g') like '%${SUFIXO}' )
  or lower(coalesce($EMAIL_EXPR,'')) like '%' || lower('$ALVO') || '%'
  or lower(coalesce(c.label,'')) like '%' || lower('$ALVO') || '%'
)"

titulo "1) Cadastro do número"
q "
$CTE
select coalesce($EMAIL_EXPR,'(sem email)') as cadastro, c.label as caixa,
       coalesce(nullif(c.fone,''),'-')     as telefone,
       coalesce(nullif(c.pnid,''),'!! VAZIO') as phone_number_id,
       coalesce(nullif(c.waba,''),'!! VAZIO') as waba_id,
       case when c.token='' then '!! SEM TOKEN' else 'token ok ('||length(c.token)||' chars)' end as token,
       c.ativo, coalesce(c.nid,'(legado)') as numero_id
from caixas c join auth.users u on u.id = c.user_id
where $FILTRO order by c.quando;
"

LINHAS="$(psql "$DB" -X -tA -F'|' -c "
  $CTE
  select coalesce($EMAIL_EXPR,''), c.label, c.pnid, c.waba, c.token, coalesce(c.nid,'')
  from caixas c join auth.users u on u.id = c.user_id
  where $FILTRO" 2>/dev/null)"

if [ -z "$LINHAS" ]; then
  c_err "Nenhuma caixa casou com '$ALVO' (busquei por phone_number_id, e-mail e últimos 8 dígitos '$SUFIXO')."
  titulo "Caixas cadastradas (para você escolher o alvo correto)"
  q "
  $CTE
  select coalesce($EMAIL_EXPR,'(sem email)') as cadastro, c.label as caixa,
         coalesce(nullif(c.fone,''),'-') as telefone, coalesce(nullif(c.pnid,''),'-') as phone_number_id, c.ativo
  from caixas c join auth.users u on u.id = c.user_id
  order by 1, c.quando;
  "
  exit 1
fi

while IFS='|' read -r email label pnid waba token nid; do
  [ -z "${pnid// }${nid// }" ] && continue
  titulo "2) Meta Cloud API — ${label:-sem nome} ($email)"
  if [ -z "${pnid// }" ] || [ -z "${token// }" ]; then
    c_err "  Credencial incompleta (phone_number_id ou token vazio) -> reconecte esta caixa no CRM."
  elif command -v jq >/dev/null; then
    r="$(curl -s -m 20 "https://graph.facebook.com/v21.0/${pnid}?fields=display_phone_number,verified_name,quality_rating,platform_type,name_status,code_verification_status,status,throughput" -H "Authorization: Bearer ${token}")"
    if echo "$r" | jq -e '.error' >/dev/null 2>&1; then
      c_err "  TOKEN/ID INVÁLIDO: $(echo "$r" | jq -r '.error.message')"
    else
      echo "$r" | jq .
      PLAT="$(echo "$r" | jq -r '.platform_type // "?"')"
      if [ "$PLAT" = "NOT_APPLICABLE" ] || [ "$PLAT" = "null" ]; then
        c_err "  platform_type=$PLAT -> este número NÃO está ativo na Cloud API (registro incompleto)."
        echo   "     é necessário concluir o registro/migração do número na Meta (Embedded Signup até o fim + PIN de 6 dígitos)."
      else
        c_ok "  platform_type=$PLAT (número operando na Cloud API)"
      fi
    fi

    titulo "3) Webhook assinado nesta WABA"
    if [ -z "${waba// }" ]; then
      c_err "  meta_waba_id vazio -> impossível checar/assinar webhook. Reconecte a caixa."
    else
      s="$(curl -s -m 20 "https://graph.facebook.com/v21.0/${waba}/subscribed_apps" -H "Authorization: Bearer ${token}")"
      if echo "$s" | jq -e '.error' >/dev/null 2>&1; then
        c_warn "  não consegui ler: $(echo "$s" | jq -r '.error.message')"
      elif [ "$(echo "$s" | jq '.data | length')" = "0" ]; then
        c_err "  WEBHOOK NÃO ASSINADO -> é exatamente por isso que não chega mensagem."
        echo   "  corrigir agora:"
        echo   "     ./deploy/reparar-coexistencia.sh ${pnid}"
      else
        c_ok "  assinado por: $(echo "$s" | jq -r '[.data[].whatsapp_business_api_data.name] | join(", ")')"
      fi
    fi

    # Coexistência (SMB): sem os campos smb_* assinados no APP, nada chega.
    CVS="$(echo "$r" | jq -r '.code_verification_status // "?"')"
    if [ "$CVS" = "NOT_VERIFIED" ]; then
      c_warn "  code_verification_status=NOT_VERIFIED -> provável COEXISTÊNCIA (SMB)."
      APP_ID_ENV="${FACEBOOK_APP_ID:-}"
      APP_SECRET_ENV="${FACEBOOK_APP_SECRET:-}"
      if [ -n "$APP_ID_ENV" ] && [ -n "$APP_SECRET_ENV" ]; then
        FIELDS_NOW="$(curl -s -m 20 "https://graph.facebook.com/v21.0/${APP_ID_ENV}/subscriptions?access_token=${APP_ID_ENV}|${APP_SECRET_ENV}" \
          | jq -r '[.data[]? | select(.object=="whatsapp_business_account") | .fields[]?.name] | join(",")')"
        echo "  campos assinados no app: ${FIELDS_NOW:-(nenhum)}"
        case "$FIELDS_NOW" in
          *smb_message_echoes*) c_ok "  smb_message_echoes OK" ;;
          *) c_err "  FALTA smb_message_echoes -> rode: ./deploy/reparar-coexistencia.sh ${pnid}" ;;
        esac
      else
        c_warn "  FACEBOOK_APP_ID/SECRET ausentes no .env — não pude checar os campos do app."
      fi
    fi

  fi

  titulo "4) Tráfego já registrado nesta caixa"
  if [ -n "${nid// }" ]; then
    ESCOPO="whatsapp_number_id = '$nid'"
  else
    c_warn "  caixa ainda LEGADA (só em crm_settings) -> dados sem whatsapp_number_id"
    ESCOPO="whatsapp_number_id is null"
  fi
  q "
  select (select count(*) from public.crm_contacts c where c.$ESCOPO)                          as contatos,
         (select count(*) from public.crm_messages m where m.$ESCOPO and m.direction='inbound')  as recebidas,
         (select count(*) from public.crm_messages m where m.$ESCOPO and m.direction='outbound') as enviadas,
         (select max(m.created_at) from public.crm_messages m where m.$ESCOPO)                   as ultima;
  "
done <<< "$LINHAS"

titulo "5) O webhook está chegando na VPS? (modo escuta)"
if docker ps --format '{{.Names}}' | grep -q '^zapmro-functions$'; then
  c_warn "  Mande UMA mensagem para o número parado e observe abaixo por 90s..."
  timeout 90 docker logs -f --since 10s zapmro-functions 2>&1 \
    | grep --line-buffered -iE 'webhook|phone_number_id|whatsapp_number|inbound|ON CONFLICT|error' \
    || c_warn "  nenhuma linha em 90s -> a Meta NÃO chamou o webhook (problema é no lado Meta/assinatura, não no código)."
else
  c_err "  container zapmro-functions parado: docker compose -f deploy/postgres-stack/docker-compose.yml up -d functions"
fi

titulo "Como interpretar"
cat <<'FIM'
  * Item 5 sem NENHUMA linha            -> a Meta não entrega. Causa: webhook não assinado na WABA
                                           (item 3) ou número não registrado na Cloud API (item 2).
                                           NÃO é bug do nosso código.
  * Item 5 com linhas + erro            -> chegou aqui e falhou; a linha de erro diz onde.
  * platform_type NOT_APPLICABLE        -> registro do número na Meta ficou pela metade.
  * "no celular fica no reloginho"      -> ESPERADO: número migrado para API oficial para de
                                           funcionar no app WhatsApp. O envio passa a ser só pelo CRM.
FIM
