#!/bin/bash
# ============================================================
# DEPLOY SCRIPT - MRO Project → Supabase Externo
# ============================================================
# USO:
#   1. Preencha o .env com as credenciais do seu Supabase externo
#   2. chmod +x deploy/external-supabase-deploy.sh
#   3. ./deploy/external-supabase-deploy.sh
# ============================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MRO → SUPABASE EXTERNO DEPLOY${NC}"
echo -e "${BLUE}========================================${NC}"

# Verifica se .env existe na raiz
echo ""
echo -e "${YELLOW}[1/7] Verificando configuracoes...${NC}"

if [ ! -f ".env" ]; then
    echo -e "${RED}ERRO: Arquivo .env nao encontrado!${NC}"
    echo "Copie .env.example para .env e preencha as credenciais do Supabase."
    exit 1
fi

# Carrega .env
set -a
source .env
set +a

# Valida variaveis obrigatorias
REQUIRED_VARS=(
    "VITE_SUPABASE_URL"
    "VITE_SUPABASE_PUBLISHABLE_KEY"
    "SUPABASE_ACCESS_TOKEN"
    "SUPABASE_PROJECT_REF"
    "POSTGRES_PASSWORD"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}ERRO: Variaveis obrigatorias faltando no .env:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

echo -e "${GREEN}  OK: Configuracoes validadas${NC}"
echo "  Projeto: $SUPABASE_PROJECT_REF"
echo "  URL: $VITE_SUPABASE_URL"

# 1) Build do frontend
echo ""
echo -e "${YELLOW}[2/7] Build do frontend (Vite)...${NC}"
npm run build
echo -e "${GREEN}  Build concluido!${NC}"

# 2) Link com o Supabase CLI
echo ""
echo -e "${YELLOW}[3/7] Linkando projeto com Supabase externo...${NC}"
echo "$SUPABASE_ACCESS_TOKEN" | supabase login --token "$SUPABASE_ACCESS_TOKEN" 2>/dev/null || true
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$POSTGRES_PASSWORD" --no-backup
echo -e "${GREEN}  Projeto linkado com sucesso!${NC}"

# 3) Push migrations (schema do banco)
echo ""
echo -e "${YELLOW}[4/7] Aplicando migrations no banco...${NC}"
DB_URL="postgres://postgres.$SUPABASE_PROJECT_REF@aws-0-$SUPABASE_PROJECT_REF.sa-east-1.rds.amazonaws.com:5432/postgres"
supabase db push --db-url "$DB_URL" --password "$POSTGRES_PASSWORD"
echo -e "${GREEN}  Migrations aplicadas!${NC}"

# 4) Deploy Edge Functions
echo ""
echo -e "${YELLOW}[5/7] Deploying Edge Functions...${NC}"

FUNCTION_COUNT=0
FAILED_FUNCTIONS=()

for func in supabase/functions/*/; do
    FUNC_NAME=$(basename "$func")
    if [ "$FUNC_NAME" = "_shared" ]; then
        continue
    fi
    echo -n "  > $FUNC_NAME... "
    if supabase functions deploy "$FUNC_NAME" --project-ref "$SUPABASE_PROJECT_REF" 2>&1; then
        echo -e "${GREEN}OK${NC}"
        FUNCTION_COUNT=$((FUNCTION_COUNT + 1))
    else
        echo -e "${RED}FALHOU${NC}"
        FAILED_FUNCTIONS+=("$FUNC_NAME")
    fi
done

echo ""
echo -e "${GREEN}  $FUNCTION_COUNT funcoes deployadas${NC}"

if [ ${#FAILED_FUNCTIONS[@]} -gt 0 ]; then
    echo -e "${YELLOW}  Funalhes com erro (tentando novamente):${NC}"
    for func in "${FAILED_FUNCTIONS[@]}"; do
        echo "    - $func"
        supabase functions deploy "$func" --project-ref "$SUPABASE_PROJECT_REF" || true
    done
fi

# 5) Secrets das Edge Functions
echo ""
echo -e "${YELLOW}[6/7] Configurando Secrets das Edge Functions...${NC}"

SECRETS_TO_SET=(
    "OPENAI_API_KEY"
    "META_ACCESS_TOKEN"
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
)

for secret in "${SECRETS_TO_SET[@]}"; do
    VALUE="${!secret}"
    if [ -n "$VALUE" ]; then
        echo "  > $secret"
        supabase secrets set "$secret=$VALUE" --project-ref "$SUPABASE_PROJECT_REF"
    fi
done

echo -e "${GREEN}  Secrets configurados!${NC}"

# 6) Storage Buckets
echo ""
echo -e "${YELLOW}[6b/7] Configurando Storage Buckets...${NC}"

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
    echo -n "  > $BUCKET_NAME... "
    supabase storage create-bucket "$BUCKET_NAME" \
        --project-ref "$SUPABASE_PROJECT_REF" \
        --public="$BUCKET_PUBLIC" 2>/dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}ja existia${NC}"
done

# 7) Verificacao final
echo ""
echo -e "${YELLOW}[7/7] Verificacao final...${NC}"
echo "  > Edge Functions deployadas: $FUNCTION_COUNT"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DEPLOY CONCLUIDO!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  URLs importantes:"
echo "  - Dashboard: https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF"
echo "  - API URL:  $VITE_SUPABASE_URL"
echo ""
