#!/usr/bin/env bash
# ============================================================================
#  ZapmPro - Concluir o registro de UM número na Cloud API (passo do PIN)
# ----------------------------------------------------------------------------
#  Quando usar:
#    O diagnóstico mostrou o número com
#         platform_type            = CLOUD_API
#         code_verification_status = NOT_VERIFIED     <-- registro incompleto
#         contatos/mensagens       = 0
#    Nesse estado a Meta NÃO entrega mensagens: o número está apontado para a
#    Cloud API, mas nunca foi "registrado" (o /register com PIN de 6 dígitos).
#    É exatamente por isso que no celular fica no "reloginho".
#
#  Uso na VPS:
#     cd /var/www/ia-mro
#     chmod +x deploy/registrar-numero-cloudapi.sh
#     ./deploy/registrar-numero-cloudapi.sh <PHONE_NUMBER_ID> <PIN_6_DIGITOS>
#
#  Exemplo:
#     ./deploy/registrar-numero-cloudapi.sh 1277217672141708 123456
#
#  O PIN é o "two-step verification PIN" (6 dígitos) escolhido pelo cliente.
#  Se ele não tem/não lembra, defina um novo com:
#     ./deploy/registrar-numero-cloudapi.sh <PHONE_NUMBER_ID> <PIN> --definir-pin
# ============================================================================
set -uo pipefail

# blindagem contra paginador (less engolindo a saída)
if [ -t 1 ] && [ -z "${ZAPMRO_SEM_PAGER:-}" ]; then
  export ZAPMRO_SEM_PAGER=1 PAGER=cat PSQL_PAGER=cat LESS=FRX
  "$0" "$@" 2>&1 | cat
  exit "${PIPESTATUS[0]}"
fi
export PAGER=cat PSQL_PAGER=cat LESS=FRX

PNID="${1:-}"
PIN="${2:-}"
MODO="${3:-}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$RAIZ/deploy/postgres-stack/.env"
SECRETS_FILE="$RAIZ/deploy/postgres-stack/secrets.env"
API="https://graph.facebook.com/v21.0"

c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*"; }
titulo() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

[ -n "$PNID" ] && [ -n "$PIN" ] || {
  c_err "Uso: ./deploy/registrar-numero-cloudapi.sh <PHONE_NUMBER_ID> <PIN_6_DIGITOS> [--definir-pin]"; exit 1; }
[[ "$PIN" =~ ^[0-9]{6}$ ]] || { c_err "O PIN precisa ter exatamente 6 dígitos."; exit 1; }
[ -f "$ENV_FILE" ] || { c_err "Não encontrei $ENV_FILE (rode dentro da pasta do projeto na VPS)."; exit 1; }
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
q1() { psql "$DB" -X -tA -P pager=off -c "$1" 2>/dev/null; }

TOKEN="$(q1 "select coalesce(meta_access_token,'') from public.crm_whatsapp_numbers where meta_phone_number_id = '$PNID' limit 1")"
if [ -z "$TOKEN" ]; then
  TOKEN="$(q1 "select coalesce(meta_access_token,'') from public.crm_settings where meta_phone_number_id = '$PNID' limit 1")"
fi
[ -n "$TOKEN" ] || { c_err "Não achei token para o phone_number_id $PNID no banco. Reconecte a caixa no CRM."; exit 1; }
c_ok "token da caixa localizado (${#TOKEN} chars)"

estado() {
  curl -s -m 25 "$API/$PNID?fields=display_phone_number,verified_name,platform_type,name_status,code_verification_status,status,quality_rating" \
    -H "Authorization: Bearer $TOKEN"
}

titulo "Antes"
estado | jq .

if [ "$MODO" = "--definir-pin" ]; then
  titulo "Definindo o PIN de verificação em duas etapas"
  # endpoint correto usa query string (?pin=), não corpo JSON
  r="$(curl -s -m 30 -X POST "$API/$PNID/two_step?pin=$PIN" -H "Authorization: Bearer $TOKEN")"
  echo "$r" | jq .
  if echo "$r" | jq -e '.error' >/dev/null 2>&1; then
    c_warn "não foi possível definir o PIN: $(echo "$r" | jq -r '.error.message')"
    c_warn "em contas SMB/Coexistência isso é esperado — o PIN não se aplica. Seguindo."
  else
    c_ok "PIN definido"
  fi
fi

titulo "Registrando o número na Cloud API (/register)"
r="$(curl -s -m 60 -X POST "$API/$PNID/register" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      -d "{\"messaging_product\":\"whatsapp\",\"pin\":\"$PIN\"}")"
echo "$r" | jq .

if echo "$r" | jq -e '.error' >/dev/null 2>&1; then
  MSG="$(echo "$r" | jq -r '.error.message')"
  SUB="$(echo "$r" | jq -r '.error.error_subcode // empty')"

  if printf '%s' "$MSG" | grep -qi 'not available for SMB'; then
    c_warn "Esta caixa é SMB / COEXISTÊNCIA (número continua no app WhatsApp Business)."
    cat <<'FIM'

  O que isso significa (não é erro nosso, e não tem /register):
   * Números onboardados em Coexistência NÃO passam pelo /register e ficam
     permanentemente com code_verification_status = NOT_VERIFIED. Isso é normal.
   * Nesse modo o número continua funcionando no celular; a Cloud API só recebe
     cópia das conversas SE o app estiver assinando os campos de coexistência.

  Checklist para as mensagens começarem a chegar:
   1) App Dashboard > WhatsApp > Configuration > Webhook fields — assinar:
          messages
          smb_message_echoes        (mensagens enviadas pelo celular)
          smb_app_state_sync        (contatos/estado do app)
          history                   (histórico inicial)
      Sem "messages" + "smb_message_echoes" nada chega nesta caixa.
   2) O cliente precisa concluir o Embedded Signup até a etapa de sincronizar o
      app (aceitar no celular: Configurações > Ferramentas comerciais > API).
      Se ele fechou antes disso, a WABA fica criada mas sem vínculo de conversas.
   3) No celular, manter o WhatsApp Business aberto/online na primeira sync.
   4) Depois, reconfirmar com:
          ./deploy/diagnosticar-um-numero.sh <PHONE_NUMBER_ID>

  ATALHO: o passo (1) + reassinatura da WABA já é automatizado por:
       ./deploy/reparar-coexistencia.sh <PHONE_NUMBER_ID>

  Alternativa definitiva (recomendada se ele quer só CRM):
      migrar o número de verdade para a Cloud API (deixa de funcionar no app):
      excluir o número da conta SMB e adicioná-lo pelo WhatsApp Manager como
      número da Cloud API — aí o /register com PIN passa a funcionar.
FIM
    titulo "Executando o reparo de coexistência agora"
    if [ -x "$(dirname "$0")/reparar-coexistencia.sh" ]; then
      "$(dirname "$0")/reparar-coexistencia.sh" "$PNID" || true
    else
      WABA="$(q1 "select coalesce(meta_waba_id,'') from public.crm_whatsapp_numbers where meta_phone_number_id = '$PNID' limit 1")"
      [ -n "$WABA" ] && curl -s -m 25 -X POST "$API/$WABA/subscribed_apps" -H "Authorization: Bearer $TOKEN" | jq .
    fi
    exit 0
  fi


  c_err "registro falhou: $MSG (subcode ${SUB:-n/a})"
  cat <<'FIM'

  Como resolver conforme a mensagem:
   * "PIN mismatch" / "incorrect PIN"     -> o PIN informado não é o do número.
                                             Rode de novo com --definir-pin para gravar um novo.
   * "already registered"                  -> já está registrado; siga para a verificação abaixo.
   * "requires verification" / OTP          -> o número ainda não teve o código (SMS/voz) validado.
                                             Precisa concluir no Gerenciador da WhatsApp Business
                                             (Meta Business Suite > Contas do WhatsApp > Números)
                                             ou refazer o Embedded Signup no CRM até o fim.
   * "rate limit"                           -> aguarde alguns minutos e repita.
FIM
  exit 1
fi
c_ok "registro aceito pela Meta"

titulo "Depois (aguardando 8s para a Meta propagar)"
sleep 8
DEPOIS="$(estado)"
echo "$DEPOIS" | jq .

CVS="$(echo "$DEPOIS" | jq -r '.code_verification_status // "?"')"
NST="$(echo "$DEPOIS" | jq -r '.name_status // "?"')"

if [ "$CVS" = "VERIFIED" ]; then
  c_ok "code_verification_status=VERIFIED -> o número passa a receber e enviar mensagens."
else
  c_warn "code_verification_status=$CVS -> ainda não verificado. Conclua a verificação do número no Gerenciador da Meta."
fi
if [ "$NST" != "APPROVED" ]; then
  c_warn "name_status=$NST -> o nome de exibição não está aprovado. Não bloqueia o recebimento,"
  echo   "   mas envio de templates e a exibição do nome só liberam após a aprovação (Meta Business Suite)."
fi

titulo "Reassinando o webhook nesta WABA (idempotente)"
WABA="$(q1 "select coalesce(meta_waba_id,'') from public.crm_whatsapp_numbers where meta_phone_number_id = '$PNID' limit 1")"
if [ -n "$WABA" ]; then
  curl -s -m 25 -X POST "$API/$WABA/subscribed_apps" -H "Authorization: Bearer $TOKEN" | jq .
else
  c_warn "meta_waba_id vazio no banco — reassine manualmente após reconectar a caixa."
fi

titulo "Próximo passo"
cat <<FIM
  Envie uma mensagem para o número e confirme a chegada:
     ./deploy/diagnosticar-um-numero.sh $PNID
  O item 4 (tráfego) deve sair de 0 e o item 5 deve mostrar linhas de webhook.
FIM
