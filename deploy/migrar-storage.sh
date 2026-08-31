#!/usr/bin/env bash
# =============================================================================
#  migrar-storage.sh
#
#  Traz os ARQUIVOS (binários) do Storage da nuvem para a stack da VPS.
#  - Lista buckets/objetos pela função exportar-storage-vps (protegida por senha)
#  - Baixa cada arquivo pela URL pública da nuvem
#  - Envia para a stack local com upsert (idempotente: pode rodar quantas vezes
#    quiser, nada é apagado nem duplicado)
#
#      cd /var/www/ia-mro && ./deploy/migrar-storage.sh
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

command -v node >/dev/null 2>&1 || die "node não instalado (apt-get install -y nodejs)"

# Confirma apenas o papel declarado no JWT, sem imprimir ou registrar a chave.
jwt_role="$(LOCAL_SERVICE_KEY="${SERVICE_ROLE_KEY:-}" node -e '
  try {
    const token = process.env.LOCAL_SERVICE_KEY || "";
    const payload = token.split(".")[1] || "";
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    process.stdout.write(String(json.role || ""));
  } catch { process.stdout.write(""); }
')"
[ "$jwt_role" = "service_role" ] || die "SERVICE_ROLE_KEY local inválida: o JWT não declara role=service_role"

export CLOUD_URL="${CLOUD_URL:-https://aossudsganqiapcoqthe.supabase.co}"
export CLOUD_ANON="${CLOUD_ANON:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvc3N1ZHNnYW5xaWFwY29xdGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NjUyOTQsImV4cCI6MjA5NDI0MTI5NH0.iXRkC4lymM_vVOYI1Q2AfrXBxRa-9gTIpMX6jGVnCgQ}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Ga145523@}"
export LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:${GATEWAY_PORT:-8000}}"
export LOCAL_SERVICE_KEY="${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY ausente no .env da stack}"
export CONCURRENCY="${CONCURRENCY:-4}"   # baixo para não tomar 429 da nuvem
export RETRIES="${RETRIES:-5}"

sec "Corrigindo permissões administrativas do Storage"
DB="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT:-5432}/${POSTGRES_DB:-postgres}"
command -v psql >/dev/null 2>&1 || die "psql não instalado"
psql "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
ALTER ROLE service_role BYPASSRLS;
ALTER ROLE supabase_storage_admin CREATEROLE BYPASSRLS;
GRANT anon, authenticated, service_role TO supabase_storage_admin;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA storage TO service_role;

-- Defesa em profundidade: o storage-api executa operações de objeto com o
-- papel presente no JWT. Estas policies mantêm acesso administrativo somente
-- para service_role mesmo se o atributo BYPASSRLS for alterado por um restart.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_objects ON storage.objects;
CREATE POLICY service_role_all_objects ON storage.objects
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_buckets ON storage.buckets;
CREATE POLICY service_role_all_buckets ON storage.buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);
SQL
( cd "$STACK" && docker compose up -d storage >/dev/null )
# O nginx resolve TODOS os upstreams (auth/rest/realtime/storage/functions) ao
# iniciar. Um simples `restart gateway` falha se qualquer container não existir
# na rede, como ocorreu com "host not found in upstream realtime". `up gateway`
# cria/inicia as dependências declaradas; a recriação garante que a configuração
# com resolução DNS dinâmica seja carregada mesmo após um restart loop antigo.
( cd "$STACK" && docker compose up -d --force-recreate gateway >/dev/null )
ok "papéis anon/authenticated/service_role liberados para o Storage"

sec "Esperando a stack local responder"
storage_ready=0
ultimo_codigo="000"
for i in $(seq 1 90); do
  # o Storage responde 200 (lista) ou 4xx (payload/rota) — qualquer um prova que
  # está no ar. Capturamos a falha sem `|| echo 000`: o curl já escreve "000"
  # com -w quando não conecta, e o fallback antigo produzia "000000", aceito
  # equivocadamente como sucesso.
  if ! ultimo_codigo="$(curl -sS -o /tmp/zapmro-storage-check.json -m 10 -w '%{http_code}' \
    "$LOCAL_URL/storage/v1/bucket" \
    -H "Authorization: Bearer $LOCAL_SERVICE_KEY" -H "apikey: $LOCAL_SERVICE_KEY" 2>/dev/null)"; then
    ultimo_codigo="000"
  fi
  if [[ "$ultimo_codigo" =~ ^[234][0-9]{2}$ ]]; then
    storage_ready=1
    break
  fi
  sleep 2
done
if [ "$storage_ready" != 1 ]; then
  err "Storage não respondeu corretamente (último HTTP: $ultimo_codigo)."
  echo "Resposta recebida:" >&2
  sed 's/^/      /' /tmp/zapmro-storage-check.json 2>/dev/null | head -20 >&2 || true
  echo "Estado dos containers:" >&2
  ( cd "$STACK" && docker compose ps storage gateway ) >&2 || true
  echo "Últimas linhas do Storage:" >&2
  ( cd "$STACK" && docker compose logs --tail 80 storage ) >&2 || true
  echo "Últimas linhas do gateway:" >&2
  ( cd "$STACK" && docker compose logs --tail 40 gateway ) >&2 || true
  die "corrija o serviço de Storage e rode ./deploy/migrar-storage.sh de novo"
fi
ok "storage local respondendo (HTTP $ultimo_codigo)"


sec "Copiando arquivos (nuvem → VPS)"
node "$ROOT/deploy/postgres-stack/scripts/copiar-storage.mjs"

sec "Conferência final"
resultado="$(curl -fsS "$LOCAL_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $LOCAL_SERVICE_KEY" -H "apikey: $LOCAL_SERVICE_KEY" \
  | head -c 2000)"
echo "$resultado"
echo "$resultado" | grep -q '"name"' || die "nenhum bucket foi confirmado na stack local"
ok "Migração do Storage finalizada."
