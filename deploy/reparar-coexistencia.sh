#!/usr/bin/env bash
# ============================================================================
#  ZapmPro - Reparo de caixa em COEXISTÊNCIA (SMB)
# ----------------------------------------------------------------------------
#  Para números onboardados em Coexistência (continuam funcionando no app
#  WhatsApp Business). Nesse modo:
#    * /register NÃO existe  -> code_verification_status fica NOT_VERIFIED (normal)
#    * as conversas só chegam se o webhook assinar os campos smb_*
#
#  Este script:
#    1) localiza a caixa no Postgres (token/WABA)
#    2) mostra os campos hoje assinados no app Meta
#    3) reassina com messages + smb_message_echoes + smb_app_state_sync + history
#       (com fallback automático, para nunca quebrar as outras caixas)
#    4) reassina o app na WABA (idempotente)
#    5) escuta o webhook por 90s para confirmar chegada
#
#  Uso:
#     chmod +x deploy/reparar-coexistencia.sh
#     ./deploy/reparar-coexistencia.sh 1277217672141708
# ============================================================================
set -uo pipefail

# Blindagem contra paginador (less engolia a saída)
if [ -t 1 ] && [ -z "${ZAPMRO_SEM_PAGER:-}" ]; then
  LOG="/tmp/zapmro-reparo-coex-$(date +%Y%m%d-%H%M%S).log"
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
API="https://graph.facebook.com/v21.0"

c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*"; }
titulo() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

[ -n "$ALVO" ] || { c_err "Uso: ./deploy/reparar-coexistencia.sh <PHONE_NUMBER_ID | telefone | email>"; exit 1; }
[ -f "$ENV_FILE" ] || { c_err "Não encontrei $ENV_FILE (rode na pasta do projeto na VPS)."; exit 1; }
command -v psql >/dev/null || { c_err "psql ausente: sudo apt-get install -y postgresql-client"; exit 1; }
command -v jq   >/dev/null || { c_err "jq ausente: sudo apt-get install -y jq"; exit 1; }

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
q1() { psql "$DB" -v ON_ERROR_STOP=0 -X -tA -P pager=off -c "$1" 2>/dev/null; }
[ -n "$(q1 'select 1')" ] || { c_err "Sem conexão com o banco (container zapmro-db de pé?)"; exit 1; }

APP_ID="${FACEBOOK_APP_ID:-}"
APP_SECRET="${FACEBOOK_APP_SECRET:-}"
BASE_URL="${PUBLIC_API_URL:-${PUBLIC_FUNCTIONS_URL:-}}"
VERIFY="${META_WEBHOOK_VERIFY_TOKEN:-mro-crm-whatsapp-webhook-v1}"

SUFIXO="$(printf '%s' "$ALVO" | tr -cd '0-9' | tail -c 9)"

EMAIL_EXPR="null::text"
if [ "$(q1 "select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email'")" = "1" ]; then
  EMAIL_EXPR="u.email"
fi

LINHAS="$(psql "$DB" -X -tA -F'|' -P pager=off -c "
  select coalesce($EMAIL_EXPR,''), coalesce(n.label,'(sem nome)'),
         coalesce(n.meta_phone_number_id,''), coalesce(n.meta_waba_id,''),
         coalesce(n.meta_access_token,'')
  from public.crm_whatsapp_numbers n
  join auth.users u on u.id = n.user_id
  where n.meta_phone_number_id = '$ALVO'
     or ('$SUFIXO' <> '' and regexp_replace(coalesce(n.meta_display_phone_number,''), '[^0-9]', '', 'g') like '%${SUFIXO}')
     or lower(coalesce($EMAIL_EXPR,'')) like '%' || lower('$ALVO') || '%'
" 2>/dev/null)"

[ -n "$LINHAS" ] || { c_err "Nenhuma caixa casou com '$ALVO'. Rode ./deploy/diagnosticar-um-numero.sh para listar."; exit 1; }

titulo "1) Campos assinados hoje no app Meta"
if [ -z "$APP_ID" ] || [ -z "$APP_SECRET" ]; then
  c_err "  FACEBOOK_APP_ID / FACEBOOK_APP_SECRET ausentes — preencha em deploy/postgres-stack/secrets.env e rode de novo."
else
  curl -s -m 25 "$API/${APP_ID}/subscriptions?access_token=${APP_ID}|${APP_SECRET}" \
    | jq -r '.data[]? | "objeto=\(.object) campos=\([.fields[]?.name] | join(","))\ncallback=\(.callback_url // "-")"' \
    || c_warn "  não consegui ler as inscrições do app"
fi

titulo "2) Reassinando o app com os campos de coexistência"
if [ -z "$APP_ID" ] || [ -z "$APP_SECRET" ] || [ -z "$BASE_URL" ]; then
  c_err "  faltam FACEBOOK_APP_ID / FACEBOOK_APP_SECRET (secrets.env) ou PUBLIC_API_URL/SITE_URL (.env) — pulando."
else
  CALLBACK="${BASE_URL%/}/functions/v1/meta-whatsapp-crm"
  echo "  callback: $CALLBACK"
  OK=""
  for FIELDS in \
    "messages,smb_message_echoes,smb_app_state_sync,history,message_template_status_update" \
    "messages,smb_message_echoes,smb_app_state_sync,history" \
    "messages,smb_message_echoes" \
    "messages"
  do
    R="$(curl -s -m 30 -X POST "$API/${APP_ID}/subscriptions" \
      -d "object=whatsapp_business_account" \
      -d "callback_url=${CALLBACK}" \
      -d "fields=${FIELDS}" \
      -d "verify_token=${VERIFY}" \
      -d "access_token=${APP_ID}|${APP_SECRET}")"
    if [ "$(echo "$R" | jq -r '.success // false')" = "true" ]; then
      c_ok "  assinado com: $FIELDS"
      OK=1
      break
    fi
    c_warn "  recusado ($FIELDS): $(echo "$R" | jq -r '.error.message // .')"
  done
  [ -n "$OK" ] || c_err "  a Meta recusou todos os conjuntos de campos — verifique permissões do app."
fi

titulo "3) Reassinando o app em cada WABA das caixas encontradas"
while IFS='|' read -r email label pnid waba token; do
  [ -n "${pnid// }" ] || continue
  echo "  -> $label ($email) pnid=$pnid"
  if [ -z "${token// }" ]; then
    c_err "     sem token nesta caixa: reconecte no CRM."
    continue
  fi
  INFO="$(curl -s -m 25 "$API/${pnid}?fields=display_phone_number,verified_name,platform_type,name_status,code_verification_status,status" -H "Authorization: Bearer ${token}")"
  echo "$INFO" | jq .
  if [ -n "${waba// }" ]; then
    curl -s -m 25 -X POST "$API/${waba}/subscribed_apps" -H "Authorization: Bearer ${token}" | jq .
    curl -s -m 25 "$API/${waba}/subscribed_apps" -H "Authorization: Bearer ${token}" \
      | jq -r '.data[]? | "     assinado por: \(.whatsapp_business_api_data.name // "?")"'
  else
    c_err "     meta_waba_id vazio -> reconecte a caixa no CRM."
  fi
done <<< "$LINHAS"

titulo "4) Escutando o webhook por 90s"
if docker ps --format '{{.Names}}' | grep -q '^zapmro-functions$'; then
  c_warn "  Mande UMA mensagem PARA e OUTRA DO celular deste número agora..."
  timeout 90 docker logs -f --since 10s zapmro-functions 2>&1 \
    | grep --line-buffered -iE 'WEBHOOK|WEBHOOK-SMB|WEBHOOK-ECHO|phone_number_id|error' \
    || c_warn "  nenhuma linha em 90s -> a Meta não entregou nada (falta a sync do app no celular)."
else
  c_err "  container zapmro-functions parado: docker compose -f deploy/postgres-stack/docker-compose.yml up -d functions"
fi

titulo "Se ainda não chegar nada"
cat <<'FIM'
  Em Coexistência a Meta só envia conversas se o cliente concluiu a sincronização
  do app no celular (WhatsApp Business > Configurações > Ferramentas comerciais > API).
  Se ele fechou o Embedded Signup antes disso, a WABA existe mas não há vínculo:
    a) refazer o Embedded Signup no CRM até o fim, aceitando no celular; ou
    b) migrar de vez para Cloud API (o número deixa de funcionar no app) —
       aí /register + PIN passam a valer e o número fica VERIFIED.
FIM
