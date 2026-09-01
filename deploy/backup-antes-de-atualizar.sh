#!/usr/bin/env bash
# =============================================================================
#  backup-antes-de-atualizar.sh — snapshot COMPLETO antes de qualquer update
#
#      cd /var/www/ia-mro && ./deploy/backup-antes-de-atualizar.sh
#
#  Salva em /var/backups/zapmro/<data-hora>/ :
#    · banco.sql.gz  → dump completo (todos os schemas: public, auth, storage…)
#    · env/          → .env e secrets.env da stack (tokens, chaves, senhas)
#    · volumes.txt   → lista dos volumes docker (nada é apagado)
#  Não altera nada no servidor: só lê e copia.
# =============================================================================
set -Eeuo pipefail

C_G='\033[0;32m'; C_Y='\033[1;33m'; C_R='\033[0;31m'; N='\033[0m'
ok()   { echo -e "${C_G}✔${N} $*"; }
warn() { echo -e "${C_Y}!${N} $*"; }
die()  { echo -e "${C_R}✘${N} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="$ROOT/deploy/postgres-stack"
[ -f "$STACK/.env" ] || die "não encontrei $STACK/.env — rode este script na pasta do projeto na VPS"

set -a; . "$STACK/.env"; set +a

DEST="/var/backups/zapmro/$(date +%Y%m%d-%H%M%S)"
sudo_() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
sudo_ mkdir -p "$DEST/env"
sudo_ chown "$(id -u):$(id -g)" "$DEST" "$DEST/env"

# ---- 1) banco completo -------------------------------------------------------
if docker ps --format '{{.Names}}' | grep -qx zapmro-db; then
  docker exec zapmro-db pg_dumpall -U postgres --clean --if-exists \
    | gzip > "$DEST/banco.sql.gz"
  ok "dump do banco: $DEST/banco.sql.gz ($(du -h "$DEST/banco.sql.gz" | cut -f1))"
else
  die "container zapmro-db não está rodando — suba a stack antes de fazer backup"
fi

# ---- 2) tokens e configuração ------------------------------------------------
cp "$STACK/.env" "$DEST/env/postgres-stack.env"
[ -f "$STACK/secrets.env" ] && cp "$STACK/secrets.env" "$DEST/env/secrets.env"
[ -f "$ROOT/.env" ]         && cp "$ROOT/.env" "$DEST/env/raiz.env"
chmod -R 600 "$DEST/env"/* || true
ok "tokens e chaves copiados para $DEST/env/"

# ---- 3) inventário -----------------------------------------------------------
docker volume ls > "$DEST/volumes.txt" 2>/dev/null || true
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > "$DEST/containers.txt" 2>/dev/null || true
psql "postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT:-5432}/${POSTGRES_DB:-postgres}" \
  -tAc "select table_name||' = '||(xpath('/r/text()', query_to_xml(format('select count(*) from public.%I', table_name), false, true, '')))[1]::text
        from information_schema.tables where table_schema='public' order by table_name" \
  > "$DEST/contagens.txt" 2>/dev/null || warn "não consegui gerar contagens (opcional)"

ok "backup concluído em $DEST"
echo
echo "Para restaurar (só se precisar):"
echo "  gunzip -c $DEST/banco.sql.gz | docker exec -i zapmro-db psql -U postgres"
