#!/bin/bash
# ============================================================
# DEPLOY SCRIPT - Storage Buckets
# Cria os 8 buckets no projeto Supabase externo
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  STORAGE BUCKETS SETUP${NC}"
echo -e "${YELLOW}========================================${NC}"

if [ ! -f ".env" ]; then
    echo -e "${RED}ERRO: .env nao encontrado${NC}"
    exit 1
fi

set -a
source .env
set +a

BUCKETS=(
    "crm-media:public"
    "assets:public"
    "inteligencia-fotos:public"
    "metodo-seguidor-content:public"
    "reports:public"
    "uploads:public"
    "creatives:public"
    "profiles:public"
)

for entry in "${BUCKETS[@]}"; do
    BUCKET_NAME="${entry%%:*}"
    BUCKET_PUBLIC="${entry##*:}"
    
    echo -n "  > $BUCKET_NAME ($BUCKET_PUBLIC)... "
    
    supabase storage create-bucket "$BUCKET_NAME" \
        --project-ref "$SUPABASE_PROJECT_REF" \
        --public="$BUCKET_PUBLIC" 2>/dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}ja existia${NC}"
done

echo ""
echo -e "${GREEN}Buckets configurados!${NC}"
echo "Verifique em: https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/storage"
