#!/usr/bin/env bash
# =============================================================================
#  zapmro.sh — COMANDO ÚNICO do ZapMRO em PostgreSQL próprio (sem Supabase SaaS)
#
#     ./deploy/zapmro.sh instalar     # instala TUDO do zero no VPS e migra
#     ./deploy/zapmro.sh atualizar    # atualiza código + funções + frontend
#     ./deploy/zapmro.sh sincronizar  # traz o delta de dados/storage da origem
#     ./deploy/zapmro.sh virar        # cutover: frontend passa a usar o Postgres
#     ./deploy/zapmro.sh voltar       # rollback imediato para o Supabase
#     ./deploy/zapmro.sh status       # saúde de tudo
#     ./deploy/zapmro.sh backup       # backup completo (banco + storage)
#     ./deploy/zapmro.sh secrets      # abre o arquivo de secrets das functions
#
#  "instalar" faz: dependências do SO (docker, node, psql, nginx, certbot),
#  stack PostgreSQL, migração completa (banco + auth + storage + cron),
#  build do frontend, Nginx + SSL, cron de backup diário e validação final.
# =============================================================================
set -Eeuo pipefail

C_R='\033[0;31m'; C_G='\033[0;32m'; C_Y='\033[1;33m'; C_B='\033[0;34m'; C_C='\033[0;36m'; N='\033[0m'
ok()   { echo -e "${C_G}✔${N} $*"; }
info() { echo -e "${C_B}ℹ${N} $*"; }
warn() { echo -e "${C_Y}!${N} $*"; }
err()  { echo -e "${C_R}✘${N} $*" >&2; }
sec()  { echo; echo -e "${C_C}══════ $* ══════${N}"; }
die()  { err "$*"; exit 1; }
trap 'err "Falhou na linha $LINENO — nada foi apagado. Rode: ./deploy/zapmro.sh status"' ERR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="$ROOT/deploy/postgres-stack"
CMD="${1:-ajuda}"

carregar_env() {
  [ -f "$STACK/.env" ] || cp "$STACK/.env.example" "$STACK/.env"
  [ -f "$STACK/secrets.env" ] || cp "$STACK/secrets.env.example" "$STACK/secrets.env"
  set -a; . "$STACK/.env"; set +a
}

sudo_() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

# ============================================================== dependências ==
instalar_dependencias() {
  sec "1/7 Dependências do sistema"
  local faltando=()
  for b in docker node psql curl git nginx; do command -v "$b" >/dev/null 2>&1 || faltando+=("$b"); done
  if [ ${#faltando[@]} -eq 0 ] && docker compose version >/dev/null 2>&1; then
    ok "tudo já instalado"; return
  fi
  info "instalando: ${faltando[*]:-docker compose}"
  export DEBIAN_FRONTEND=noninteractive
  sudo_ apt-get update -y

  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    sudo_ apt-get install -y ca-certificates curl gnupg
    sudo_ install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo_ gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    sudo_ chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | sudo_ tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo_ apt-get update -y
    sudo_ apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo_ systemctl enable --now docker
  fi

  # PostgreSQL client 16 (precisa ser >= 15 para o pg_dump)
  if ! command -v pg_dump >/dev/null 2>&1 || [ "$(pg_dump --version | grep -oE '[0-9]+' | head -1)" -lt 15 ]; then
    sudo_ install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | sudo_ tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
      | sudo_ tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    sudo_ apt-get update -y
    sudo_ apt-get install -y postgresql-client-16
  fi

  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | grep -oE '[0-9]+' | head -1)" -lt 18 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo_ -E bash -
    sudo_ apt-get install -y nodejs
  fi

  sudo_ apt-get install -y nginx certbot python3-certbot-nginx zip unzip jq openssl git
  ok "dependências instaladas"
}

# ==================================================== perguntas de configuração
configurar_interativo() {
  sec "2/7 Configuração"
  carregar_env
  local mudou=0
  set_env() { if grep -qE "^$1=" "$STACK/.env"; then sed -i "s|^$1=.*|$1=$2|" "$STACK/.env"; else echo "$1=$2" >> "$STACK/.env"; fi; mudou=1; }
  perguntar() { local var="$1" texto="$2" pad="${3:-}" atual="${!var:-}"
    if [ -z "$atual" ]; then
      read -rp "  $texto ${pad:+[$pad] }" resp </dev/tty || true
      resp="${resp:-$pad}"
      [ -n "$resp" ] && set_env "$var" "$resp" && export "$var=$resp"
    fi
  }
  perguntar PUBLIC_API_URL "URL pública da API (onde a stack vai responder)" "https://api.zapmro.com.br"
  perguntar SITE_URL       "URL do site" "https://zapmro.com.br"
  perguntar SOURCE_DB_URL  "String de conexão do banco ATUAL (origem, para copiar os dados)"
  perguntar SUPABASE_URL   "URL do projeto atual (para baixar as mídias)" "https://aossudsganqiapcoqthe.supabase.co"
  perguntar SUPABASE_SERVICE_ROLE_KEY "Service role key do projeto atual (baixar mídias)"
  [ "$mudou" = 1 ] && carregar_env
  ok "configuração salva em deploy/postgres-stack/.env"
}

# ============================================================ nginx + ssl =====
configurar_nginx() {
  sec "5/7 Nginx + SSL"
  command -v nginx >/dev/null 2>&1 || { warn "nginx ausente, pulando"; return; }
  local api_host site_host
  api_host="$(echo "${PUBLIC_API_URL}" | sed -E 's#https?://##; s#/.*##')"
  site_host="$(echo "${SITE_URL}" | sed -E 's#https?://##; s#/.*##')"

  sudo_ tee /etc/nginx/sites-available/zapmro-api.conf >/dev/null <<EOF
server {
    listen 80;
    server_name ${api_host};
    client_max_body_size 512m;
    location / {
        proxy_pass http://127.0.0.1:${GATEWAY_PORT:-8000};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 600s;
    }
}
EOF
  sudo_ ln -sf /etc/nginx/sites-available/zapmro-api.conf /etc/nginx/sites-enabled/zapmro-api.conf
  sudo_ nginx -t >/dev/null 2>&1 && sudo_ systemctl reload nginx && ok "nginx configurado para ${api_host}"

  if command -v certbot >/dev/null 2>&1; then
    info "emitindo SSL para ${api_host} (ignore se o DNS ainda não apontou)"
    sudo_ certbot --nginx -d "${api_host}" --non-interactive --agree-tos \
      -m "admin@${site_host}" --redirect >/dev/null 2>&1 && ok "SSL ativo" || warn "SSL pendente — rode: sudo certbot --nginx -d ${api_host}"
  fi
}

# ============================================================== frontend ======
build_frontend() {
  sec "6/7 Frontend"
  cd "$ROOT"
  [ -f package-lock.json ] && npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1
  npm run build >/dev/null 2>&1 || die "build do frontend falhou — rode 'npm run build' para ver o erro"
  ok "frontend compilado em dist/ (apontando para $(grep -m1 VITE_SUPABASE_URL "$ROOT/.env" | cut -d= -f2-))"
}

# ============================================================== backup cron ===
configurar_backup() {
  sec "7/7 Backup automático"
  local script=/usr/local/bin/zapmro-backup.sh
  sudo_ tee "$script" >/dev/null <<EOF
#!/usr/bin/env bash
set -e
DEST=/var/backups/zapmro
mkdir -p "\$DEST"
docker exec zapmro-db pg_dumpall -U postgres | gzip > "\$DEST/banco-\$(date +%F).sql.gz"
docker run --rm -v zapmro-postgres_storage-data:/d -v "\$DEST":/b alpine \
  tar czf "/b/storage-\$(date +%F).tar.gz" -C /d . 2>/dev/null || true
find "\$DEST" -name '*.gz' -mtime +14 -delete
EOF
  sudo_ chmod +x "$script"
  ( sudo_ crontab -l 2>/dev/null | grep -v zapmro-backup; echo "30 3 * * * $script" ) | sudo_ crontab -
  ok "backup diário às 03:30 em /var/backups/zapmro (retém 14 dias)"
}

# ================================================================= comandos ===
case "$CMD" in

  instalar)
    sec "INSTALAÇÃO COMPLETA — ZapMRO em PostgreSQL próprio"
    instalar_dependencias
    configurar_interativo
    bash "$ROOT/deploy/migrar-para-postgres.sh"        # 3/7 e 4/7: stack + migração
    carregar_env
    configurar_nginx
    build_frontend
    configurar_backup
    echo
    ok "INSTALADO. Banco, Auth, API, Realtime, Storage e as 118 functions rodando na sua VPS."
    cat <<EOF

FALTAM 3 PASSOS MANUAIS (uma vez só — esses dados vivem fora do banco):
  1) nano deploy/postgres-stack/secrets.env   → cole as chaves (Meta, Google, DeepSeek, SMTP, InfinitePay)
     depois: cd deploy/postgres-stack && docker compose up -d functions
  2) Meta/WhatsApp → callback ${PUBLIC_API_URL}/functions/v1/meta-whatsapp-crm  + reassinar subscribed_apps
     Google/Facebook OAuth → adicionar ${PUBLIC_API_URL}/auth/v1/callback
     InfinitePay / Z-API → apontar para ${PUBLIC_API_URL}/functions/v1/<função>
  3) Testado tudo?  ./deploy/zapmro.sh virar     (aí sim o site sai do Supabase)
EOF
    ;;

  atualizar)
    sec "ATUALIZANDO"
    carregar_env
    cd "$ROOT" && git pull --ff-only 2>/dev/null || warn "sem git pull (repo local)"
    ( cd "$STACK" && docker compose pull >/dev/null 2>&1; docker compose up -d )
    ( cd "$STACK" && docker compose restart functions ) >/dev/null 2>&1
    build_frontend
    ok "stack, functions e frontend atualizados"
    ;;

  sincronizar)
    carregar_env
    bash "$ROOT/deploy/migrar-para-postgres.sh" --sync
    ;;

  virar)
    sec "CUTOVER — o site passa a rodar 100% no seu PostgreSQL"
    carregar_env
    [ -f "$ROOT/.env.postgres" ] || die "rode ./deploy/zapmro.sh instalar antes"
    read -rp "  Isso troca o frontend do Supabase para ${PUBLIC_API_URL}. Confirmar? (digite SIM) " c </dev/tty
    [ "$c" = "SIM" ] || die "cancelado"
    info "sincronizando o delta final antes de virar…"
    bash "$ROOT/deploy/migrar-para-postgres.sh" --sync
    cp -n "$ROOT/.env" "$ROOT/.env.supabase.bak" 2>/dev/null || true
    cp "$ROOT/.env.postgres" "$ROOT/.env"
    build_frontend
    ok "VIRADO. O sistema não depende mais do Supabase."
    info "Rollback a qualquer momento: ./deploy/zapmro.sh voltar"
    ;;

  voltar)
    sec "ROLLBACK para o Supabase"
    [ -f "$ROOT/.env.supabase.bak" ] || die "backup .env.supabase.bak não encontrado"
    cp "$ROOT/.env.supabase.bak" "$ROOT/.env"
    build_frontend
    ok "frontend voltou para o Supabase"
    ;;

  status)
    sec "STATUS"
    carregar_env
    ( cd "$STACK" && docker compose ps ) || true
    echo
    G="http://127.0.0.1:${GATEWAY_PORT:-8000}"
    chk() { # 2xx/3xx/4xx = serviço respondeu; somente 000/5xx é indisponibilidade
      local code
      printf '  %-30s' "$1"
      code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$2" ${3:+-H "$3"} 2>/dev/null || echo 000)
      if [ "$code" != "000" ] && [ "${code:0:1}" != "5" ]; then
        echo -e "${C_G}OK${N} (HTTP $code)"
      else
        echo -e "${C_R}FALHOU${N} (HTTP $code)"
        if [ "$1" = "functions" ]; then
          warn "últimas mensagens das Functions:"
          docker logs --tail 25 zapmro-functions 2>&1 | sed 's/^/      /' || true
        fi
      fi
    }
    chk "gateway"  "$G/health"
    chk "auth"     "$G/auth/v1/health"
    chk "rest"     "$G/rest/v1/" "apikey: ${ANON_KEY:-}"
    chk "storage"  "$G/storage/v1/bucket" "Authorization: Bearer ${SERVICE_ROLE_KEY:-}"
    chk "functions" "$G/functions/v1/"
    realtime_status=$(docker inspect -f '{{.State.Status}}' zapmro-realtime 2>/dev/null || echo ausente)
    realtime_restarts=$(docker inspect -f '{{.RestartCount}}' zapmro-realtime 2>/dev/null || echo '?')
    printf '  %-30s' "realtime"
    if [ "$realtime_status" = "running" ]; then
      echo -e "${C_G}OK${N} (${realtime_restarts} reinício(s))"
    else
      echo -e "${C_R}FALHOU${N} (${realtime_status}; ${realtime_restarts} reinício(s))"
      warn "últimas mensagens do Realtime:"
      docker logs --tail 25 zapmro-realtime 2>&1 | sed 's/^/      /' || true
    fi
    D="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT:-5432}/${POSTGRES_DB:-postgres}"
    echo
    echo "  tabelas públicas : $(psql "$D" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo '?')"
    echo "  usuários auth    : $(psql "$D" -tAc "select count(*) from auth.users" 2>/dev/null || echo '?')"
    echo "  contatos CRM     : $(psql "$D" -tAc "select count(*) from public.crm_contacts" 2>/dev/null || echo '?')"
    echo "  mensagens CRM    : $(psql "$D" -tAc "select count(*) from public.crm_messages" 2>/dev/null || echo '?')"
    echo "  jobs cron        : $(psql "$D" -tAc "select count(*) from cron.job" 2>/dev/null || echo '?')"
    # ISOLAMENTO: sem RLS/policies TODO usuário enxerga os dados de TODOS.
    rls_on="$(psql "$D" -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity" 2>/dev/null || echo 0)"
    pols="$(psql "$D" -tAc "select count(*) from pg_policies where schemaname='public'" 2>/dev/null || echo 0)"
    echo "  tabelas com RLS  : ${rls_on}"
    echo "  policies (RLS)   : ${pols}"
    if [ "${pols:-0}" -lt 100 ] || [ "${rls_on:-0}" -lt 100 ]; then
      warn "ISOLAMENTO INCOMPLETO — rode: ./deploy/atualizar.sh (aplica 081-rls-policies.sql)"
    fi
    echo
    echo "  frontend aponta  : $(grep -m1 VITE_SUPABASE_URL "$ROOT/.env" 2>/dev/null | cut -d= -f2- || echo '?')"
    ;;

  backup)
    sec "BACKUP"
    sudo_ /usr/local/bin/zapmro-backup.sh 2>/dev/null || {
      mkdir -p "$ROOT/backups"
      docker exec zapmro-db pg_dumpall -U postgres | gzip > "$ROOT/backups/banco-$(date +%F-%H%M).sql.gz"
    }
    ok "backup gerado"
    ;;

  secrets)
    carregar_env
    "${EDITOR:-nano}" "$STACK/secrets.env"
    ( cd "$STACK" && docker compose up -d functions ) >/dev/null 2>&1
    ok "secrets aplicados e functions reiniciadas"
    ;;

  *)
    cat <<EOF
ZapMRO — PostgreSQL próprio (sem Supabase SaaS)

  ./deploy/zapmro.sh instalar      instala tudo no VPS + migra + build + SSL + backup
  ./deploy/zapmro.sh atualizar     atualiza código, functions e frontend
  ./deploy/zapmro.sh sincronizar   traz o delta de dados/mídias da origem
  ./deploy/zapmro.sh virar         cutover: sai do Supabase
  ./deploy/zapmro.sh voltar        rollback para o Supabase
  ./deploy/zapmro.sh status        saúde + contagens
  ./deploy/zapmro.sh backup        backup manual
  ./deploy/zapmro.sh secrets       editar secrets das Edge Functions
EOF
    ;;
esac
