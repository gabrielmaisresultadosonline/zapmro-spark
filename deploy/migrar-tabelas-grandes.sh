#!/usr/bin/env bash
# =============================================================================
#  migrar-tabelas-grandes.sh
#
#  O dump 040-dados.sql foi gerado sem as tabelas gigantes (crm_contacts,
#  crm_messages, ...). Este script busca essas tabelas direto da nuvem, em
#  páginas, e insere no Postgres da VPS. Pode rodar quantas vezes quiser:
#  todos os INSERTs usam ON CONFLICT DO NOTHING (nada é duplicado nem apagado).
#
#      cd /var/www/ia-mro && ./deploy/migrar-tabelas-grandes.sh
# =============================================================================
set -Eeuo pipefail

C_R='\033[0;31m'; C_G='\033[0;32m'; C_Y='\033[1;33m'; C_C='\033[0;36m'; N='\033[0m'
ok()   { echo -e "${C_G}✔${N} $*"; }
info() { echo -e "  $*"; }
warn() { echo -e "${C_Y}!${N} $*"; }
err()  { echo -e "${C_R}✘${N} $*" >&2; }
sec()  { echo; echo -e "${C_C}══════ $* ══════${N}"; }
die()  { err "$*"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="$ROOT/deploy/postgres-stack"

[ -f "$STACK/.env" ] || die "não achei $STACK/.env — rode ./deploy/atualizar.sh primeiro"
set -a; . "$STACK/.env"; set +a
DB="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT:-5432}/${POSTGRES_DB:-postgres}"

command -v jq >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq jq; }
command -v psql >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq postgresql-client; }

# --- origem (nuvem) ----------------------------------------------------------
CLOUD_URL="${CLOUD_URL:-https://aossudsganqiapcoqthe.supabase.co}"
CLOUD_ANON="${CLOUD_ANON:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvc3N1ZHNnYW5xaWFwY29xdGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NjUyOTQsImV4cCI6MjA5NDI0MTI5NH0.iXRkC4lymM_vVOYI1Q2AfrXBxRa-9gTIpMX6jGVnCgQ}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Ga145523@}"
FN="$CLOUD_URL/functions/v1/exportar-tabela-vps"

PAGE="${PAGE:-500}"
TABELAS="${TABELAS:-crm_contacts crm_messages crm_activities crm_flow_executions crm_scheduled_messages crm_webhook_delivery_logs crm_metrics crm_flow_steps crm_webhooks}"

migrar_tabela() {
  local table="$1" offset=0 total="?" rows sqlfile resp done_flag inseridos=0
  sec "Migrando $table"
  while :; do
    resp="$(curl -sS -X POST "$FN" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $CLOUD_ANON" \
      -H "apikey: $CLOUD_ANON" \
      -d "{\"adminPassword\":\"$ADMIN_PASSWORD\",\"table\":\"$table\",\"offset\":$offset,\"limit\":$PAGE}")" || {
        err "falha de rede em $table offset=$offset"; return 1; }

    if echo "$resp" | jq -e '.error' >/dev/null 2>&1; then
      err "$table: $(echo "$resp" | jq -r '.error')"; return 1
    fi

    rows="$(echo "$resp" | jq -r '.rows')"
    total="$(echo "$resp" | jq -r '.total // "?"')"
    done_flag="$(echo "$resp" | jq -r '.done')"

    if [ "$rows" != "0" ]; then
      sqlfile="$(mktemp /tmp/zapmro-${table}-XXXX.sql)"
      {
        echo "SET session_replication_role = replica;"
        echo "$resp" | jq -r '.sql'
      } > "$sqlfile"
      if ! psql "$DB" -v ON_ERROR_STOP=0 -q -f "$sqlfile" >"/tmp/zapmro-mig-${table}.log" 2>&1; then
        warn "erros em $table offset=$offset — veja /tmp/zapmro-mig-${table}.log"
      fi
      rm -f "$sqlfile"
      inseridos=$((inseridos + rows))
    fi

    printf "\r  %s: %s / %s      " "$table" "$inseridos" "$total"
    [ "$done_flag" = "true" ] && break
    offset=$((offset + PAGE))
  done
  echo
  ok "$table concluída ($inseridos linhas trazidas)"
}

for t in $TABELAS; do
  migrar_tabela "$t" || warn "pulei $t (veja o erro acima)"
done

sec "Conferência final"
cnt() { psql "$DB" -tAc "$1" 2>/dev/null || echo "?"; }
for t in $TABELAS; do
  printf "  %-28s %s\n" "$t" "$(cnt "select count(*) from public.$t")"
done
ok "Migração das tabelas grandes finalizada."
