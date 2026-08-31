#!/bin/bash
# ============================================================
# DEPLOY SCRIPT - Migrations Only
# Para rodar APENAS as migrations sem redeployar functions
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  MIGRATIONS ONLY${NC}"
echo -e "${YELLOW}========================================${NC}"

if [ ! -f ".env" ]; then
    echo -e "${RED}ERRO: .env nao encontrado${NC}"
    exit 1
fi

set -a
source .env
set +a

echo "Linkando projeto..."
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$POSTGRES_PASSWORD" --no-backup

echo "Aplicando migrations..."

DB_URL="postgres://postgres.$SUPABASE_PROJECT_REF@aws-0-$SUPABASE_PROJECT_REF.sa-east-1.rds.amazonaws.com:5432/postgres"
supabase db push --db-url "$DB_URL" --password "$POSTGRES_PASSWORD"

echo -e "${GREEN}Migrations aplicadas!${NC}"
