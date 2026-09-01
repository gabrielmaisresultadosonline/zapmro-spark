#!/bin/bash
# ============================================================
# DEPLOY SCRIPT - Edge Functions Only
# Para redeployar APENAS as edge functions (sem mexer no banco)
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  EDGE FUNCTIONS DEPLOY${NC}"
echo -e "${YELLOW}========================================${NC}"

if [ ! -f ".env" ]; then
    echo -e "${RED}ERRO: .env nao encontrado${NC}"
    exit 1
fi

set -a
source .env
set +a

FUNCTION_COUNT=0
FAILED=()

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
        FAILED+=("$FUNC_NAME")
    fi
done

echo ""
echo -e "${GREEN}$FUNCTION_COUNT funcoes deployadas${NC}"

if [ ${#FAILED[@]} -gt 0 ]; then
    echo -e "${YELLOW}Falharam: ${FAILED[*]}${NC}"
fi
