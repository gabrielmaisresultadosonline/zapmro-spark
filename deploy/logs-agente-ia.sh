#!/bin/bash
# ============================================================
# DIAGNOSTICO + LOGS DO AGENTE I.A. (WhatsApp CRM)
#
# Uso na VPS:
#   ./deploy/logs-agente-ia.sh                 # diagnostico + escuta 120s
#   ./deploy/logs-agente-ia.sh email@dono.com  # filtra por dono
#   ./deploy/logs-agente-ia.sh "" 300          # escuta 300s
#
# Saida tambem gravada em /tmp/logs-agente-ia.txt
# ============================================================
set -uo pipefail

# --- escudo contra pager (psql/less abrindo tela cheia com "~" e "(END)") ---
export PAGER=cat PSQL_PAGER=cat LESS=FRX
if [ -t 1 ] && [ -z "${IA_LOG_NO_TTY:-}" ]; then
  IA_LOG_NO_TTY=1 "$0" "$@" 2>&1 | tee /tmp/logs-agente-ia.txt
  echo ""
  echo "Log salvo em /tmp/logs-agente-ia.txt"
  exit 0
fi

FILTRO="${1:-}"
SEGUNDOS="${2:-120}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

carregar() {
  [ -f "$1" ] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$1"
  set +a
}
carregar "$ROOT/.env"
carregar "$ROOT/deploy/postgres-stack/.env"
carregar "$ROOT/deploy/postgres-stack/secrets.env"

PGPASS="${POSTGRES_PASSWORD:-}"
PGDB="${POSTGRES_DB:-postgres}"
PGUSER_="${POSTGRES_USER:-postgres}"
CONTAINER_DB="${DB_CONTAINER:-zapmro-db}"
CONTAINER_FN="${FN_CONTAINER:-zapmro-functions}"

psqlq() {
  docker exec -e PGPASSWORD="$PGPASS" -e PAGER=cat "$CONTAINER_DB" \
    psql -U "$PGUSER_" -d "$PGDB" -P pager=off -v ON_ERROR_STOP=0 -c "$1" 2>&1
}

echo "========================================================"
echo " 1) CONFIGURACAO DO AGENTE I.A. POR CADASTRO"
echo "========================================================"
WHERE="TRUE"
if [ -n "$FILTRO" ]; then
  WHERE="lower(u.email) LIKE lower('%${FILTRO}%')"
fi
psqlq "
SELECT u.email,
       s.ai_agent_enabled            AS ia_ligada,
       (s.openai_api_key IS NOT NULL AND s.openai_api_key <> '') AS tem_openai_key,
       (s.meta_phone_number_id IS NOT NULL)  AS settings_tem_numero,
       (s.meta_access_token IS NOT NULL)     AS settings_tem_token,
       length(coalesce(s.ai_system_prompt,'')) AS tam_prompt
  FROM public.crm_settings s
  LEFT JOIN auth.users u ON u.id = s.user_id
 WHERE ${WHERE}
 ORDER BY s.ai_agent_enabled DESC NULLS LAST
 LIMIT 30;"

echo ""
echo "========================================================"
echo " 2) CAIXAS (NUMEROS) E CREDENCIAIS POR CAIXA"
echo "    Sem token/phone_number_id na caixa, a I.A. nao envia."
echo "========================================================"
psqlq "
SELECT u.email,
       n.meta_display_phone_number AS numero,
       n.is_primary,
       n.is_active,
       (n.meta_phone_number_id IS NOT NULL) AS tem_phone_id,
       (n.meta_access_token IS NOT NULL)    AS tem_token
  FROM public.crm_whatsapp_numbers n
  LEFT JOIN auth.users u ON u.id = n.user_id
 WHERE ${WHERE}
 ORDER BY u.email, n.is_primary DESC
 LIMIT 50;"

echo ""
echo "========================================================"
echo " 3) CONTATOS COM I.A. ATIVA (ultimas 24h)"
echo "========================================================"
psqlq "
SELECT c.wa_id, c.ai_active, c.flow_state, c.whatsapp_number_id IS NOT NULL AS tem_caixa,
       c.last_message_received_at
  FROM public.crm_contacts c
  LEFT JOIN auth.users u ON u.id = c.user_id
 WHERE (c.ai_active = true OR c.flow_state = 'ai_handling')
   AND ${WHERE}
 ORDER BY c.last_message_received_at DESC NULLS LAST
 LIMIT 30;"

echo ""
echo "========================================================"
echo " 4) ULTIMOS EVENTOS DE I.A. NO LOG DA FUNCAO (historico)"
echo "========================================================"
docker logs --since 30m "$CONTAINER_FN" 2>&1 \
  | grep -aiE '\[AI-AUTO\]|\[AI-AGENT|\[WEBHOOK-AI-DEBUG\]|OpenAI' \
  | tail -n 80 || echo "(sem eventos de I.A. nos ultimos 30 minutos)"

echo ""
echo "========================================================"
echo " 5) ESCUTA AO VIVO (${SEGUNDOS}s) — MANDE UMA MENSAGEM AGORA"
echo "    Etapas esperadas: processing_started -> credentials_resolved"
echo "    -> model_reply_received -> reply_sent"
echo "========================================================"
timeout "${SEGUNDOS}" docker logs -f --since 5s "$CONTAINER_FN" 2>&1 \
  | grep -aiE '\[AI-AUTO\]|\[AI-AGENT|\[WEBHOOK-AI-DEBUG\]|\[SEND-MESSAGE\]|OpenAI' \
  || true

echo ""
echo "========================================================"
echo " COMO LER"
echo "========================================================"
cat <<'TXT'
 skipped_not_enabled              -> Agente I.A. desligado em Configuracoes
 failed_missing_openai_key        -> falta a chave sk-... da OpenAI
 failed_missing_meta_credentials  -> a CAIXA nao tem token/phone_number_id
                                     (reconecte esse numero no CRM)
 credentials_fallback_settings    -> respondendo com o numero principal
 failed_model_request             -> OpenAI recusou (chave/credito/modelo)
 send_failed                      -> Meta recusou o envio (veja o erro na linha)
 reply_sent                       -> respondeu com sucesso

 Nenhuma linha durante a escuta -> o webhook nao chegou:
   ./deploy/diagnosticar-um-numero.sh <phone_number_id>
TXT
