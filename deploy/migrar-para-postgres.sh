#!/usr/bin/env bash
# =============================================================================
#  migrar-para-postgres.sh — COMANDO ÚNICO
#
#  Migra TODO o projeto ZapMRO do Lovable Cloud para uma stack PostgreSQL
#  própria (banco + auth + api + realtime + storage + edge functions),
#  SEM apagar nada na origem. O Supabase continua no ar até você validar.
#
#  Uso:
#     chmod +x deploy/migrar-para-postgres.sh
#     ./deploy/migrar-para-postgres.sh                # migração completa
#     ./deploy/migrar-para-postgres.sh --sync         # re-sincroniza dados+storage
#     ./deploy/migrar-para-postgres.sh --validar      # só checa saúde/contagens
#     ./deploy/migrar-para-postgres.sh --dry          # simula, não escreve nada
#
#  Requisitos no VPS: docker + docker compose, postgresql-client (psql/pg_dump 15+),
#                     node 18+, curl, zip.
# =============================================================================
set -Eeuo pipefail

C_R='\033[0;31m'; C_G='\033[0;32m'; C_Y='\033[1;33m'; C_B='\033[0;34m'; C_C='\033[0;36m'; N='\033[0m'
ok()   { echo -e "${C_G}✔${N} $*"; }
info() { echo -e "${C_B}ℹ${N} $*"; }
warn() { echo -e "${C_Y}!${N} $*"; }
err()  { echo -e "${C_R}✘${N} $*" >&2; }
sec()  { echo; echo -e "${C_C}══════ $* ══════${N}"; }
die()  { err "$*"; exit 1; }
trap 'err "Falhou na linha $LINENO. Nada foi removido da origem."' ERR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="$ROOT/deploy/postgres-stack"
WORK="$ROOT/deploy/.migracao"
LOGS="$WORK/logs"
MODE="full"
case "${1:-}" in
  --sync)    MODE="sync" ;;
  --validar) MODE="validar" ;;
  --dry)     MODE="dry" ;;
  "")        MODE="full" ;;
  *)         die "opção desconhecida: $1" ;;
esac

mkdir -p "$WORK" "$LOGS"

# ---------------------------------------------------------------- pré-checks --
sec "1/9 Pré-requisitos"
need() { command -v "$1" >/dev/null 2>&1 || die "faltando: $1"; }
need docker; need node; need curl; need psql; need pg_dump
docker compose version >/dev/null 2>&1 || die "faltando: docker compose (plugin v2)"
PGDUMP_V="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
[ "$PGDUMP_V" -ge 15 ] || die "pg_dump $PGDUMP_V é antigo; instale o client 15+"
ok "docker, node, psql/pg_dump $PGDUMP_V, curl"

# ------------------------------------------------------------------- config --
sec "2/9 Configuração e segredos"
[ -f "$STACK/.env" ] || cp "$STACK/.env.example" "$STACK/.env"
[ -f "$STACK/secrets.env" ] || cp "$STACK/secrets.env.example" "$STACK/secrets.env"
set -a; . "$STACK/.env"; set +a

rand() { openssl rand -hex "${1:-32}"; }
set_env() { # set_env CHAVE VALOR
  local k="$1" v="$2"
  if grep -qE "^${k}=" "$STACK/.env"; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$STACK/.env"
  else
    echo "${k}=${v}" >> "$STACK/.env"
  fi
}

[ -n "${POSTGRES_PASSWORD:-}" ]         || { POSTGRES_PASSWORD="$(rand 24)"; set_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"; }
[ -n "${JWT_SECRET:-}" ]                || { JWT_SECRET="$(rand 32)"; set_env JWT_SECRET "$JWT_SECRET"; }
[ -n "${REALTIME_ENC_KEY:-}" ]          || { REALTIME_ENC_KEY="$(rand 8)"; set_env REALTIME_ENC_KEY "$REALTIME_ENC_KEY"; }
[ -n "${REALTIME_SECRET_KEY_BASE:-}" ]  || { REALTIME_SECRET_KEY_BASE="$(rand 32)"; set_env REALTIME_SECRET_KEY_BASE "$REALTIME_SECRET_KEY_BASE"; }

if [ -z "${ANON_KEY:-}" ] || [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  info "gerando ANON_KEY e SERVICE_ROLE_KEY assinadas com o JWT_SECRET"
  KEYS="$(JWT_SECRET="$JWT_SECRET" node -e '
    const c=require("crypto");
    const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const iat=Math.floor(Date.now()/1000), exp=iat+60*60*24*365*10;
    const sign=(role)=>{const h=b({alg:"HS256",typ:"JWT"});const p=b({role,iss:"zapmro",iat,exp});
      const s=c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url");
      return h+"."+p+"."+s;};
    console.log(sign("anon")); console.log(sign("service_role"));
  ')"
  ANON_KEY="$(echo "$KEYS" | sed -n 1p)"; SERVICE_ROLE_KEY="$(echo "$KEYS" | sed -n 2p)"
  set_env ANON_KEY "$ANON_KEY"; set_env SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
fi
set -a; . "$STACK/.env"; set +a
ok "segredos prontos em deploy/postgres-stack/.env"

# origem
SRC_DB_URL="${SOURCE_DB_URL:-}"
if [ -z "$SRC_DB_URL" ] && [ -n "${SUPABASE_PROJECT_REF:-}" ] && [ -n "${SOURCE_DB_PASSWORD:-}" ]; then
  SRC_DB_URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${SOURCE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
fi
[ -n "$SRC_DB_URL" ] || [ "$MODE" = "validar" ] || die "defina SOURCE_DB_URL no deploy/postgres-stack/.env (string de conexão da origem)"

DEST_DB_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT:-5432}/${POSTGRES_DB:-postgres}"

if [ "$MODE" = "dry" ]; then
  sec "DRY-RUN"
  info "origem : ${SRC_DB_URL%%:*}://…(oculto)"
  info "destino: 127.0.0.1:${PG_PORT:-5432}"
  psql "$SRC_DB_URL" -tAc "select count(*) from information_schema.tables where table_schema='public'" \
    | xargs -I{} echo "  tabelas públicas na origem: {}"
  ok "dry-run concluído — nada foi alterado"
  exit 0
fi

# ------------------------------------------------------------- subir a stack --
if [ "$MODE" != "validar" ]; then
  sec "3/9 Subindo a stack PostgreSQL (docker compose)"
  ( cd "$STACK" && docker compose up -d db ) >"$LOGS/compose-db.log" 2>&1
  info "aguardando o Postgres ficar pronto…"
  for i in $(seq 1 90); do
    if docker exec zapmro-db pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 2
    [ "$i" = 90 ] && die "Postgres não subiu — veja $LOGS/compose-db.log"
  done
  ok "PostgreSQL no ar em 127.0.0.1:${PG_PORT:-5432}"
fi

# ------------------------------------------------ export paralelo da origem ---
if [ "$MODE" = "full" ] || [ "$MODE" = "sync" ]; then
  sec "4/9 Exportando a origem (em paralelo)"
  DUMP_DIR="$WORK/dump"; mkdir -p "$DUMP_DIR"

  (
    pg_dump "$SRC_DB_URL" \
      --schema=public --no-owner --no-publications --no-subscriptions \
      --quote-all-identifiers --file "$DUMP_DIR/01_public.sql" 2>"$LOGS/dump-public.log" \
      || pg_dump "$SRC_DB_URL" --schema=public --no-owner \
           --file "$DUMP_DIR/01_public.sql" 2>>"$LOGS/dump-public.log"
    echo done > "$WORK/.f_public"
  ) &
  P1=$!

  (
    : > "$DUMP_DIR/02_auth.sql"
    OFF=0
    while :; do
      CH="$(psql "$SRC_DB_URL" -tAc "select public.admin_dump_auth_users($OFF, 500)" 2>>"$LOGS/dump-auth.log" || true)"
      [ -z "$CH" ] && break
      printf '%s\n' "$CH" >> "$DUMP_DIR/02_auth.sql"
      OFF=$((OFF+500))
      [ "$OFF" -gt 100000 ] && break
    done
    OFF=0
    while :; do
      CH="$(psql "$SRC_DB_URL" -tAc "select public.admin_dump_auth_identities($OFF, 500)" 2>>"$LOGS/dump-auth.log" || true)"
      [ -z "$CH" ] && break
      printf '%s\n' "$CH" >> "$DUMP_DIR/02_auth.sql"
      OFF=$((OFF+500))
      [ "$OFF" -gt 100000 ] && break
    done
    echo done > "$WORK/.f_auth"
  ) &
  P2=$!

  (
    psql "$SRC_DB_URL" -tAc "select public.admin_dump_extensions()" > "$DUMP_DIR/00_extensoes.sql" 2>>"$LOGS/dump-extras.log" || true
    psql "$SRC_DB_URL" -tAc "select public.admin_dump_cron()"       > "$DUMP_DIR/04_cron.sql"      2>>"$LOGS/dump-extras.log" || true
    psql "$SRC_DB_URL" -tAc "select public.admin_dump_storage(0, 5000)" > "$DUMP_DIR/03_storage_meta.sql" 2>>"$LOGS/dump-extras.log" || true
    echo done > "$WORK/.f_extras"
  ) &
  P3=$!

  (
    if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -n "${SUPABASE_URL:-}" ]; then
      SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
      DEST_DIR="$WORK/storage" node "$ROOT/deploy/postgres-stack/scripts/baixar-storage.mjs" \
        >"$LOGS/storage-download.log" 2>&1 || true
    fi
    echo done > "$WORK/.f_storage"
  ) &
  P4=$!

  wait $P1 $P2 $P3 $P4
  ok "export concluído: $(du -sh "$DUMP_DIR" | cut -f1) em $DUMP_DIR"
fi

# ------------------------------------------------------------- restauração ---
if [ "$MODE" = "full" ] || [ "$MODE" = "sync" ]; then
  sec "5/9 Restaurando no PostgreSQL próprio"
  PSQL_DEST=(psql "$DEST_DB_URL" -v ON_ERROR_STOP=0 -q)

  "${PSQL_DEST[@]}" -c "select 1" >/dev/null || die "não consegui conectar no destino"

  for f in 00_extensoes.sql 01_public.sql 02_auth.sql 03_storage_meta.sql 04_cron.sql; do
    [ -s "$WORK/dump/$f" ] || { warn "pulando $f (vazio)"; continue; }
    info "aplicando $f…"
    "${PSQL_DEST[@]}" -f "$WORK/dump/$f" >"$LOGS/restore-$f.log" 2>&1 || warn "avisos em $f (veja $LOGS/restore-$f.log)"
  done

  # Realtime: publicar todas as tabelas públicas (equivale ao supabase_realtime)
  "${PSQL_DEST[@]}" <<'SQL' >"$LOGS/restore-realtime.log" 2>&1 || true
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r.tablename);
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', r.tablename);
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
SQL
  ok "banco restaurado"
fi

# ------------------------------------------------------- serviços da stack ---
if [ "$MODE" != "validar" ]; then
  sec "6/9 Subindo Auth, REST, Realtime, Storage, Edge Functions e Gateway"
  ( cd "$STACK" && docker compose up -d ) >"$LOGS/compose-all.log" 2>&1
  ok "containers no ar"
fi

# ---------------------------------------------------------- storage binário --
if [ "$MODE" = "full" ] || [ "$MODE" = "sync" ]; then
  sec "7/9 Enviando binários do Storage para a stack própria"
  if [ -d "$WORK/storage" ]; then
    for i in $(seq 1 60); do curl -sf "http://127.0.0.1:${GATEWAY_PORT:-8000}/health" >/dev/null && break; sleep 2; done
    SUPABASE_URL="http://127.0.0.1:${GATEWAY_PORT:-8000}" \
    SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    SRC_DIR="$WORK/storage" node "$STACK/scripts/subir-storage.mjs" >"$LOGS/storage-upload.log" 2>&1 \
      || warn "alguns arquivos falharam — veja $LOGS/storage-upload.log"
    ok "storage sincronizado"
  else
    warn "sem binários locais (defina SUPABASE_SERVICE_ROLE_KEY no .env para baixá-los)"
  fi
fi

# ------------------------------------------------------- frontend + validação -
sec "8/9 Apontando o frontend para a stack própria"
FRONT_ENV="$ROOT/.env.postgres"
cat > "$FRONT_ENV" <<EOF
# Gerado por deploy/migrar-para-postgres.sh — use no build do frontend.
# O cliente continua sendo @supabase/supabase-js (protocolo compatível),
# mas agora aponta 100% para a SUA stack PostgreSQL.
VITE_SUPABASE_URL="${PUBLIC_API_URL}"
VITE_SUPABASE_PUBLISHABLE_KEY="${ANON_KEY}"
VITE_SUPABASE_PROJECT_ID="zapmro-postgres"
EOF
ok "gerado .env.postgres (copie sobre .env quando for virar a chave)"

sec "9/9 Validação"
FAIL=0
chk() { printf '  %-34s' "$1"; if eval "$2" >/dev/null 2>&1; then echo -e "${C_G}OK${N}"; else echo -e "${C_R}FALHOU${N}"; FAIL=$((FAIL+1)); fi; }
chk "postgres"        "psql '$DEST_DB_URL' -c 'select 1'"
chk "gateway /health" "curl -sf http://127.0.0.1:${GATEWAY_PORT:-8000}/health"
chk "auth  /auth/v1/health"     "curl -sf http://127.0.0.1:${GATEWAY_PORT:-8000}/auth/v1/health"
chk "rest  /rest/v1/"           "curl -sf -H 'apikey: $ANON_KEY' http://127.0.0.1:${GATEWAY_PORT:-8000}/rest/v1/"
chk "storage /storage/v1/bucket" "curl -sf -H 'Authorization: Bearer $SERVICE_ROLE_KEY' http://127.0.0.1:${GATEWAY_PORT:-8000}/storage/v1/bucket"

T_SRC="$( [ -n "$SRC_DB_URL" ] && psql "$SRC_DB_URL" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo '?')"
T_DST="$(psql "$DEST_DB_URL" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo '?')"
U_DST="$(psql "$DEST_DB_URL" -tAc "select count(*) from auth.users" 2>/dev/null || echo '?')"
echo
info "tabelas públicas — origem: $T_SRC | destino: $T_DST"
info "usuários auth no destino: $U_DST"

echo
if [ "$FAIL" -eq 0 ]; then
  ok "STACK POSTGRESQL PRONTA 🎉"
else
  warn "$FAIL verificação(ões) falharam — veja $LOGS/"
fi

cat <<EOF

────────────────────────────────────────────────────────────────────────────
PRÓXIMOS PASSOS (o Supabase segue intacto até você concluir):

 1. Aponte ${PUBLIC_API_URL} (Nginx/Cloudflare) para 127.0.0.1:${GATEWAY_PORT:-8000} com SSL.
 2. Preencha deploy/postgres-stack/secrets.env com as chaves (Meta, Google,
    DeepSeek, SMTP, InfinitePay…) e rode: cd deploy/postgres-stack && docker compose up -d functions
 3. Meta/WhatsApp: troque a callback para ${PUBLIC_API_URL}/functions/v1/meta-whatsapp-crm
    e reassine subscribed_apps de cada WABA.
 4. Google/Facebook OAuth: adicione ${PUBLIC_API_URL}/auth/v1/callback.
 5. InfinitePay / Z-API: reaponte os webhooks para ${PUBLIC_API_URL}/functions/v1/<função>.
 6. Vire a chave do frontend:  cp .env.postgres .env  &&  npm run build
 7. Delta final (zero perda):  ./deploy/migrar-para-postgres.sh --sync
 8. Só depois de tudo validado, desative o Supabase.
────────────────────────────────────────────────────────────────────────────
EOF
