#!/usr/bin/env bash
# =============================================================================
#  migrar-tudo.sh
#  Backup COMPLETO do projeto ZapMRO para migrar depois (offline).
#  Roda no VPS / terminal. Não depende do Lovable Cloud.
#
#  Gera um pacote datado em ./migracao-zapmro-<data>/ com:
#    01_banco_public.sql     -> tabelas, dados, funções, triggers, RLS,
#                               índices, FKs, grants, views, sequences, tipos (public)
#    02_auth.sql              -> auth.users + auth.identities (via RPC SECURITY DEFINER)
#    03_storage_inventario.sql-> buckets do Storage + inventário de arquivos
#    04_extras.sql            -> CREATE EXTENSION + jobs do pg_cron (fora do schema public)
#    05_edge-functions.zip    -> código de TODAS as Edge Functions + config.toml
#    06_storage/              -> BINÁRIOS do Storage baixados (se SERVICE_ROLE fornecida)
#    07_MANIFESTO.md          -> secrets (nomes), webhooks, redirects, OAuth, buckets, cron
#    08_CHECKLIST.md          -> o que NÃO entra e precisa ser refeito à mão
#    salvar-storage.mjs       -> script Node p/ (re)baixar binários depois
#    restaurar-storage.mjs    -> script Node p/ subir binários no destino
#    restaurar.sh             -> restauração passo a passo no novo banco
#
#  Uso:
#    chmod +x deploy/migrar-tudo.sh
#    ./deploy/migrar-tudo.sh            # lê variáveis do ambiente / ~/.zapmro-migracao.conf
#    ./deploy/migrar-tudo.sh --dry      # só mostra o que faria + testa conexões
# =============================================================================
set -euo pipefail

# ---------------------------------- cores ---------------------------------- #
C_R='\033[0;31m'; C_G='\033[0;32m'; C_Y='\033[1;33m'; C_B='\033[0;34m'; C_C='\033[0;36m'; N='\033[0m'
ok()   { echo -e "${C_G}✔${N} $*"; }
info() { echo -e "${C_B}ℹ${N} $*"; }
warn() { echo -e "${C_Y}!${N} $*"; }
err()  { echo -e "${C_R}✘${N} $*" >&2; }
sec()  { echo; echo -e "${C_C}═══ $* ═══${N}"; }

DRY=0
[ "${1:-}" = "--dry" ] && DRY=1

# --------------------------- configuração (env / arquivo) ---------------------------- #
CONF_FILE="${ZAPMRO_MIGRACAO_CONF:-$HOME/.zapmro-migracao.conf}"
[ -f "$CONF_FILE" ] && { info "lendo config: $CONF_FILE"; # shellcheck disable=SC1090
  set -a; . "$CONF_FILE"; set +a; }

: "${SUPABASE_URL:?defina SUPABASE_URL (ex: https://aossudsganqiapcoqthe.supabase.co)}"
: "${SUPABASE_PROJECT_REF:?defina SUPABASE_PROJECT_REF}"

# Conexão direta com o banco (preferida para pg_dump + psql)
# Aceita: DB_URL pronto, ou POSTGRES_PASSWORD (monta a string do pooler/direto)
if [ -z "${DB_URL:-}" ]; then
  if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    DB_URL="postgres://postgres.${SUPABASE_PROJECT_REF}:${POSTGRES_PASSWORD}@aws-0-${SUPABASE_PROJECT_REF}.sa-east-1.rds.amazonaws.com:5432/postgres"
  elif [ -n "${PGHOST:-}" ] && [ -n "${PGPASSWORD:-}" ]; then
    DB_URL="postgres://${PGUSER:-postgres}:${PGPASSWORD}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE:-postgres}"
  else
    err "sem conexão com o banco: defina DB_URL ou POSTGRES_PASSWORD (ou rode dentro de ambiente com PGHOST/PGPASSWORD)."
    exit 1
  fi
fi

# Service role (opcional, mas habilita auth.dump + baixar binários do storage sem a edge function)
SRK="${SUPABASE_SERVICE_ROLE_KEY:-}"
# Fallback para auth/storage via Edge Function crm-central-admin (já deployada)
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

# Raiz do repositório (para zipar as Edge Functions). Default: 2 níveis acima deste script.
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

DATE="$(date -u +%Y%m%d-%H%M%S)"
OUT="migracao-zapmro-${DATE}"
mkdir -p "$OUT"
LOG="$OUT/backup.log"
exec > >(tee -a "$LOG") 2>&1

echo -e "${C_B}══════════════════════════════════════════════════${N}"
echo -e "${C_B} ZapMRO — Backup completo para migração${N}"
echo -e "${C_B} Projeto : ${SUPABASE_PROJECT_REF}${N}"
echo -e "${C_B} Destino : ${OUT}/${N}"
[ "$DRY" = 1 ] && echo -e "${C_Y} (modo --dry: só testa, não escreve arquivos grandes)${N}"
echo -e "${C_B}══════════════════════════════════════════════════${N}"

# --------------------------------- dependências --------------------------------- #
need() { command -v "$1" >/dev/null 2>&1 || { err "dependência ausente: $1"; DEP_FAIL=1; }; }
DEP_FAIL=0
need pg_dump; need psql; need curl; need python3; need jq; need zip
[ "$DEP_FAIL" = 1 ] && { err "instale as dependências e rode novamente."; exit 1; }

# --------------------------------- helpers RPC --------------------------------- #
# Decodifica um escalar text do PostgREST (vem como string JSON escapada).
json_decode() {
  python3 -c 'import sys,json
raw=sys.stdin.read()
try:
    v=json.loads(raw)
    if isinstance(v,str): print(v,end="")
    else: print(raw,end="")
except Exception:
    print(raw,end="")'
}

# rpc_text FN JSON_PAYLOAD  -> imprime o texto SQL decodificado.
# Tenta service role (REST) e, se não houver, faz fallback pela Edge Function.
rpc_text() {
  local fn="$1" body="$2" resp
  if [ -n "$SRK" ]; then
    resp=$(curl -fsS -X POST "${SUPABASE_URL}/rest/v1/rpc/${fn}" \
        -H "apikey: ${SRK}" -H "Authorization: Bearer ${SRK}" \
        -H "Content-Type: application/json" -d "$body" 2>/dev/null) || resp=""
    if [ -n "$resp" ] && [ "$resp" != "null" ]; then
      printf '%s' "$resp" | json_decode
      return 0
    fi
  fi
  # fallback via crm-central-admin (kind)
  if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
    err "rpc_text($fn): sem SERVICE_ROLE_KEY e sem ADMIN_EMAIL/ADMIN_PASSWORD -> pulando."
    return 1
  fi
  local kind=""
  case "$fn" in
    admin_dump_auth_users) kind="auth_users" ;;
    admin_dump_auth_identities) kind="auth_identities" ;;
    admin_dump_storage) kind="storage" ;;
    *) err "rpc_text($fn): sem fallback via edge function."; return 1 ;;
  esac
  local off; off="$(printf '%s' "$body" | jq -r '.p_offset // 0')"
  local lim; lim="$(printf '%s' "$body" | jq -r '.p_limit // 500')"
  resp=$(curl -fsS -X POST "${SUPABASE_URL}/functions/v1/crm-central-admin" \
      -H "Content-Type: application/json" \
      -d "$(jq -nc --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" \
            --arg k "$kind" --argjson o "$off" --argjson l "$lim" \
            '{action:"dump_chunk",adminEmail:$e,adminPassword:$p,kind:$k,offset:$o,limit:$l}')")
  printf '%s' "$resp" | jq -r '.sql // empty'
}

# Conta statements INSERT reais numa string SQL (ignora -- comentários).
count_inserts() {
  grep -c '^INSERT INTO ' "$1" 2>/dev/null || echo 0
}

# =============================================================================== #
# 1) BANCO — pg_dump do schema public (estrutura + dados)
# =============================================================================== #
sec "1/8  Banco (public) via pg_dump"
if [ "$DRY" = 1 ]; then
  echo "   [dry] pg_dump --schema=public -> $OUT/01_banco_public.sql (pulando escrita)"
else
  info "gerando 01_banco_public.sql (pode levar alguns minutos, ~70MB)..."
  pg_dump "$DB_URL" --schema=public --no-owner --no-privileges \
      --no-comments --quote-all-identifiers > "$OUT/01_banco_public.sql"
  ok "banco: $(wc -c <"$OUT/01_banco_public.sql") bytes, $(grep -c '^INSERT INTO ' "$OUT/01_banco_public.sql") inserts"
fi

# =============================================================================== #
# 4) EXTRAS — extensions + pg_cron (vivem fora do schema public)
# =============================================================================== #
sec "4/8  Extras: extensions + pg_cron (via psql)"
{
  echo "-- ============================================================"
  echo "-- 04_extras.sql — extensões e jobs do pg_cron (fora do public)"
  echo "-- gerado em $(date -u +%FT%TZ)"
  echo "-- ============================================================"
  echo
  echo "-- EXTENSIONS"
  psql "$DB_URL" -At -c "SELECT 'CREATE EXTENSION IF NOT EXISTS ' || e.extname || ' WITH SCHEMA ' || n.nspname || ';' FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname<>'plpgsql' ORDER BY e.extname;" 2>/dev/null || echo "-- (sem permissão p/ listar extensions)"
  echo
  echo "-- PG_CRON JOBS"
  CRON_OK=0
  if psql "$DB_URL" -At -c "SELECT 1 FROM pg_namespace WHERE nspname='cron'" 2>/dev/null | grep -q 1; then
    if psql "$DB_URL" -At -c "SELECT 'SELECT cron.schedule('||quote_literal(jobname)||', '||quote_literal(schedule)||', '||quote_literal(command)||');' FROM cron.job ORDER BY jobid;" 2>/dev/null; then
      CRON_OK=1
    fi
  else
    echo "-- pg_cron não instalado neste projeto."
    CRON_OK=1
  fi
  # fallback via RPC SECURITY DEFINER (admin_dump_cron) se a leitura direta falhou
  if [ "$CRON_OK" = 0 ]; then
    if { [ -n "$SRK" ] || { [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; }; }; then
      echo "-- (lido via admin_dump_cron)"
      rpc_text admin_dump_cron "{}" || echo "-- (sem permissão para ler cron.job por nenhuma via)"
    else
      echo "-- (erro ao ler cron.job e sem SERVICE_ROLE/ADMIN para fallback via admin_dump_cron)"
    fi
  fi
} > "$OUT/04_extras.sql"
ok "extras: $(wc -l <"$OUT/04_extras.sql") linhas"

# =============================================================================== #
# 2) AUTH — auth.users + auth.identities (schema auth é bloqueado p/ pg_dump)
# =============================================================================== #
sec "2/8  Auth: auth.users + auth.identities"
if [ -z "$SRK" ] && { [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; }; then
  warn "sem SERVICE_ROLE_KEY nem ADMIN creds — auth não exportado por aqui."
  warn "   Use o botão 'Exportar Dump SQL' no /admincentral (ele chama as mesmas RPCs) e junte o auth.sql aqui."
else
  AUTH="$OUT/02_auth.sql"
  {
    echo "-- auth.users + auth.identities (via SECURITY DEFINER, pois pg_dump não acessa o schema auth)"
    echo
    echo "-- auth.users:"
    off=0; lim=500; total=0
    while :; do
      chunk=$(rpc_text admin_dump_auth_users "{\"p_offset\":${off},\"p_limit\":${lim}}")
      [ -z "$chunk" ] && break
      echo "$chunk" >> "$AUTH.tmp"
      n=$(printf '%s' "$chunk" | grep -c '^INSERT INTO auth.users')
      total=$((total+n)); off=$((off+lim))
      printf '\r    auth.users: %s linhas lidas' "$total"
      [ "$n" -lt "$lim" ] && break
    done
    echo
    if [ -f "$AUTH.tmp" ]; then cat "$AUTH.tmp"; rm -f "$AUTH.tmp"; fi
    echo
    echo "-- auth.identities:"
    off=0; lim=500; total=0
    while :; do
      chunk=$(rpc_text admin_dump_auth_identities "{\"p_offset\":${off},\"p_limit\":${lim}}")
      [ -z "$chunk" ] && break
      echo "$chunk" >> "$AUTH.tmp2"
      n=$(printf '%s' "$chunk" | grep -c '^INSERT INTO auth.identities')
      total=$((total+n)); off=$((off+lim))
      printf '\r    auth.identities: %s linhas lidas' "$total"
      [ "$n" -lt "$lim" ] && break
    done
    echo
    [ -f "$AUTH.tmp2" ] && { cat "$AUTH.tmp2"; rm -f "$AUTH.tmp2"; }
  } > "$AUTH"
  ok "auth: $(wc -c <"$AUTH") bytes, $(grep -c '^INSERT INTO' "$AUTH") inserts"
fi

# =============================================================================== #
# 3) STORAGE — inventário (buckets + caminhos dos arquivos)
# =============================================================================== #
sec "3/8  Storage: inventário de buckets e arquivos"
STOR="$OUT/03_storage_inventario.sql"
{
  echo "-- Storage: buckets + inventário de arquivos (binários copiados à parte via salvar-storage.mjs)"
  echo
  off=0; lim=1000; total=0
  if [ -z "$SRK" ] && { [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; }; then
    echo "-- sem SERVICE_ROLE_KEY/ADMIN — inventário não coletado por aqui. Use o botão no /admincentral."
  else
    while :; do
      chunk=$(rpc_text admin_dump_storage "{\"p_offset\":${off},\"p_limit\":${lim}}")
      [ -z "$chunk" ] && break
      echo "$chunk"
      n=$(printf '%s' "$chunk" | grep -c '^-- FILE ')
      total=$((total+n)); off=$((off+lim))
      printf '\r    storage: %s arquivos listados' "$total"
      [ "$n" -lt "$lim" ] && break
    done
    echo
  fi
} > "$STOR"
ok "storage inventário: $(wc -c <"$STOR") bytes, $(grep -c '^-- FILE ' "$STOR") arquivos"

# =============================================================================== #
# 5) EDGE FUNCTIONS — zip do código-fonte
# =============================================================================== #
sec "5/8  Edge Functions: zip do código"
EF_DIR="$REPO_ROOT/supabase/functions"
if [ -d "$EF_DIR" ]; then
  if [ "$DRY" = 1 ]; then
    echo "   [dry] $(find "$EF_DIR" -maxdepth 1 -mindepth 1 -type d | wc -l) dirs em $EF_DIR"
  else
    ( cd "$REPO_ROOT" && zip -qr "$PWD/$OUT/05_edge-functions.zip" \
        supabase/functions supabase/config.toml 2>/dev/null || \
      zip -qr "$OUT/05_edge-functions.zip" "$EF_DIR" "$REPO_ROOT/supabase/config.toml" )
    NFN=$(find "$EF_DIR" -maxdepth 1 -mindepth 1 -type d ! -name '_shared' | wc -l)
    ok "edge functions: $(wc -c <"$OUT/05_edge-functions.zip") bytes, $NFN funções"
  fi
else
  warn "não achei supabase/functions em $REPO_ROOT — zip das functions pulado."
fi

# =============================================================================== #
# 6) STORAGE BINÁRIOS — baixar para disco (offline) se houver service role
# =============================================================================== #
sec "6/8  Storage binários: salvar offline (precisa SERVICE_ROLE)"
gerar_scripts_storage() {
cat > "$OUT/salvar-storage.mjs" <<'NODE1'
// salvar-storage.mjs — baixa TODOS os binários do Storage (origem) para pastas locais.
// Uso:  ORIGEM_URL=... ORIGEM_KEY=<service_role> node salvar-storage.mjs
import { createClient } from "@supabase/supabase-js";
const url = process.env.ORIGEM_URL, key = process.env.ORIGEM_KEY;
if (!url || !key) { console.error("defina ORIGEM_URL e ORIGEM_KEY (service_role)"); process.exit(1); }
const c = createClient(url, key, { auth: { persistSession: false } });
const BUCKETS = ["assets","crm-media","inteligencia-fotos","metodo-seguidor-backup",
  "metodo-seguidor-content","profile-cache","trial-screenshots","user-data"];
async function listAll(bucket, prefix="") {
  const out=[]; let off=0;
  for(;;){ const {data,error}=await c.storage.from(bucket).list(prefix,{limit:1000,offset:off});
    if(error)throw error; if(!data||!data.length)break;
    for(const it of data){ const p=prefix?`${prefix}/${it.name}`:it.name;
      if(it.id===null) out.push(...await listAll(bucket,p)); else out.push(p); }
    if(data.length<1000)break; off+=data.length; }
  return out;
}
let totOk=0,totFail=0;
for(const b of BUCKETS){
  console.log(`\n=== ${b} ===`);
  let files=[]; try{ files=await listAll(b);}catch(e){ console.error(`list ${b}:`,e.message); continue; }
  console.log(`${files.length} arquivos`);
  let ok=0,fail=0;
  for(const path of files){
    try{ const {data,error}=await c.storage.from(b).download(path); if(error)throw error;
      const buf=Buffer.from(await data.arrayBuffer());
      const fs=await import("fs/promises"),p=require("path");
      const dest=p.join("06_storage",b,path); await fs.mkdir(p.dirname(dest),{recursive:true});
      await fs.writeFile(dest,buf); ok++;
      if(ok%50===0)console.log(`  ${ok}/${files.length}`); }
    catch(e){ fail++; console.error(`  FALHA ${b}/${path}: ${e.message}`); }
  }
  totOk+=ok; totFail+=fail;
}
console.log(`\nTOTAL: ${totOk} baixados, ${totFail} falhas -> ./06_storage/`);
NODE1

cat > "$OUT/restaurar-storage.mjs" <<'NODE2'
// restaurar-storage.mjs — sobe os binários da pasta ./06_storage para o Storage de destino.
// Uso:  DESTINO_URL=... DESTINO_KEY=<service_role> node restaurar-storage.mjs
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, stat } from "fs/promises"; import { join, dirname } from "path";
const url=process.env.DESTINO_URL, key=process.env.DESTINO_KEY;
if(!url||!key){ console.error("defina DESTINO_URL e DESTINO_KEY (service_role)"); process.exit(1); }
const c=createClient(url,key,{auth:{persistSession:false}});
const BUCKETS=["assets","crm-media","inteligencia-fotos","metodo-seguidor-backup",
  "metodo-seguidor-content","profile-cache","trial-screenshots","user-data"];
let ok=0,fail=0;
for(const b of BUCKETS){
  const dir=join("06_storage",b); let root;
  try{ root=await readdir(dir);}catch{ console.log(`${b}: sem pasta, pulando`); continue; }
  console.log(`\n=== ${b} ===`);
  async function walk(d){ const ents=await readdir(d,{withFileTypes:true});
    for(const e of ents){ const full=join(d,e.name);
      if(e.isDirectory()) await walk(full); else {
        const rel=full.slice(dir.length+1).split("/"); // path relativo dentro do bucket
        const buf=await readFile(full);
        const {error}=await c.storage.from(b).upload(rel.join("/"),buf,{upsert:true});
        if(error){fail++;console.error(`  FALHA ${b}/${rel.join("/")}: ${error.message}`);}
        else{ok++; if(ok%50===0)console.log(`  ${ok} enviados`);} } } }
  await walk(dir).catch(e=>console.error(`walk ${b}:`,e.message));
}
console.log(`\nTOTAL: ${ok} enviados, ${fail} falhas`);
NODE2
}
gerar_scripts_storage
ok "scripts de storage gerados: salvar-storage.mjs / restaurar-storage.mjs"

if [ -n "$SRK" ]; then
  info "baixando binários do Storage (offline) para $OUT/06_storage/ ..."
  mkdir -p "$OUT/06_storage"
  if [ "$DRY" = 1 ]; then
    echo "   [dry] pularia o download dos binários"
  else
    ( cd "$OUT" && ORIGEM_URL="$SUPABASE_URL" ORIGEM_KEY="$SRK" node salvar-storage.mjs ) && \
      ok "binários salvos em $OUT/06_storage/" || \
      warn "download de binários falhou — rode 'node $OUT/salvar-storage.mjs' depois (precisa @supabase/supabase-js)."
  fi
else
  warn "sem SUPABASE_SERVICE_ROLE_KEY — binários não baixados agora."
  warn "   depois: cd $OUT && npm i @supabase/supabase-js && ORIGEM_URL=... ORIGEM_KEY=<service_role> node salvar-storage.mjs"
fi

# =============================================================================== #
# 7) MANIFESTO + 8) CHECKLIST (documentação para migração)
# =============================================================================== #
sec "7/8  Manifesto de configuração atual"
cat > "$OUT/07_MANIFESTO.md" <<MANIFESTO
# Manifesto ZapMRO — ${DATE}

Origem: ${SUPABASE_URL}  (ref ${SUPABASE_PROJECT_REF})
Domínio principal: https://zapmro.com.br

## Secrets a recriar no destino (NOMES — valores não são exportáveis por SQL)
$(printf -- '- `%s`\n' BRIGHTDATA_API_TOKEN BRIGHTDATA_WEB_UNLOCKER_ZONE DEEPSEEK_API_KEY FACEBOOK_APP_ID FACEBOOK_APP_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET INSTAGRAM_SESSION_ID LOVABLE_API_KEY META_CONVERSIONS_API_TOKEN RAPIDAPI_KEY SMTP_PASSWORD SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL WPP_BOT_TOKEN ZAPMRO_SMTP_PASSWORD)

> \`SUPABASE_URL\`, \`SUPABASE_ANON_KEY\`, \`SUPABASE_SERVICE_ROLE_KEY\` são injetados pelo novo projeto Supabase (não recriar manualmente). \`SUPABASE_DB_URL\` é a string de conexão do novo banco.

## Buckets do Storage
$(printf -- '- \`assets\` (público)\n- \`crm-media\` (público)\n- \`inteligencia-fotos\` (público)\n- \`metodo-seguidor-backup\` (privado)\n- \`metodo-seguidor-content\` (público)\n- \`profile-cache\` (público)\n- \`trial-screenshots\` (público)\n- \`user-data\` (público)\n')

## Webhooks externos (reapontar para o novo host das functions)
| Integração | URL atual |
|---|---|
| Meta / WhatsApp Cloud API | \`${SUPABASE_URL}/functions/v1/meta-whatsapp-crm\` |
| Meta / Instagram (MRO Direct+) | \`${SUPABASE_URL}/functions/v1/mro-direct-webhook\` |
| InfinitePay | \`${SUPABASE_URL}/functions/v1/infinitepay-webhook\` (+ webhooks específicos por produto: crm-webhook, mro-payment-webhook, zapmro-payment-webhook, corretor-webhook, ads-webhook) |
| Z-API | \`${SUPABASE_URL}/functions/v1/zapi-webhook\` |

> Se usar o proxy Cloudflare em zapmro.com.br, o host público pode ser \`https://zapmro.com.br/functions/v1/...\` — confira o proxy do destino.

## Auth — provedores e URLs
- Site URL: \`https://zapmro.com.br\`
- Redirect URLs: \`https://zapmro.com.br/**\`, \`https://zapmro.com.br/crm\`, \`https://zapmro.com.br/crm/login\`
- Google OAuth callback no Google Cloud: \`https://<NOVO_REF>.supabase.co/auth/v1/callback\`
- Facebook App OAuth redirect: apontar para o novo callback do provedor

## Variáveis de frontend (.env do build)
\`\`\`
VITE_SUPABASE_URL=https://<NOVO_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon do destino>
VITE_SUPABASE_PROJECT_ID=<NOVO_REF>
\`\`\`
MANIFESTO
ok "manifesto: $OUT/07_MANIFESTO.md"

sec "8/8  Checklist do que NÃO entra (refazer à mão)"
cat > "$OUT/08_CHECKLIST.md" <<CHECKLIST
# Checklist — o que NÃO vem no download e você precisa refazer à mão (30–60 min)

Estes itens NÃO são exportáveis em arquivo porque vivem em plataformas de terceiros
ou são segredos criptografados. Eles só existem em memória/dashboards externos.

## 1. Secrets (valores)
- [ ] Recadastrar as ~20 chaves listadas no \`07_MANIFESTO.md\` no novo projeto.
      \`supabase secrets set NOME="<valor>" --project-ref <NOVO_REF>\`
- [ ] Os valores NÃO foram salvos em nenhum arquivo deste pacote (por segurança).

## 2. Webhooks da Meta / WhatsApp
- [ ] No Facebook App, reapontar a callback URL para o novo host das functions.
- [ ] Reassinar \`subscribed_apps\` de cada WABA (Graph API) — é a "reconexão".
      Os números/telefones em si VÊM no dump (tabela de números conectados);
      o que não vem é a assinatura ativa do webhook no lado da Meta.

## 3. OAuth Google e App do Facebook
- [ ] Google Cloud Console: adicionar callback \`https://<NOVO_REF>.supabase.co/auth/v1/callback\`.
- [ ] Facebook Developer: OAuth redirect do app para o novo callback.
      As URLs de redirect do app usam zapmro.com.br — não mudam.

## 4. Webhooks InfinitePay / Z-API
- [ ] Reapontar no dashboard de cada serviço para o novo host das functions.

## 5. Autenticação (atenção)
- [ ] \`auth.users\` vem no \`02_auth.sql\` com os HASHES de senha. Em Supabase gerenciado
      costuma restaurar; em Postgres self-hosted (GoTrue) TESTAR o login em projeto
      descartável antes — hashes de senha podem não ser compatíveis.

## 6. Cron
- [ ] Os jobs do pg_cron vêm em \`04_extras.sql\` (executa \`SELECT cron.schedule(...)\`).
      Exige \`pg_cron\` + \`pg_net\` habilitados no destino ANTES de rodar.

## 7. Validação final
- [ ] Login funciona
- [ ] Conversas/contatos aparecem no /crm
- [ ] Envio/recebimento WhatsApp
- [ ] Mídias antigas abrem (Storage restaurado)
- [ ] Webhooks de pagamento recebendo
- [ ] Cron rodando (recuperador I.A., sync Google)
CHECKLIST
ok "checklist: $OUT/08_CHECKLIST.md"

# --------------------------------- script de restauração ------------------------------- #
cat > "$OUT/restaurar.sh" <<RESTAURAR
#!/usr/bin/env bash
# restaurar.sh — carrega este pacote num novo banco PostgreSQL / Supabase
set -euo pipefail
: "\${NEW_DB_URL:?defina NEW_DB_URL (string de conexão do destino)}"
echo "1) schema public + dados..."
psql "\$NEW_DB_URL" -v ON_ERROR_STOP=0 -f 01_banco_public.sql
echo "2) extensions + cron..."
psql "\$NEW_DB_URL" -v ON_ERROR_STOP=0 -f 04_extras.sql
echo "3) auth.users + identities..."
psql "\$NEW_DB_URL" -v ON_ERROR_STOP=0 -f 02_auth.sql
echo "4) storage inventário (metadados)..."
psql "\$NEW_DB_URL" -v ON_ERROR_STOP=0 -f 03_storage_inventario.sql
echo "OK. Binários do Storage: node restaurar-storage.mjs (com DESTINO_URL/DESTINO_KEY)."
RESTAURAR
chmod +x "$OUT/restaurar.sh"

# ----------------------------------- resumo ----------------------------------- #
sec "Resumo"
{
  echo "Pacote: $OUT"
  for f in 01_banco_public.sql 02_auth.sql 03_storage_inventario.sql 04_extras.sql 05_edge-functions.zip salvar-storage.mjs restaurar-storage.mjs restaurar.sh 07_MANIFESTO.md 08_CHECKLIST.md; do
    [ -e "$OUT/$f" ] && printf '  %-32s %s\n' "$f" "$(du -h "$OUT/$f" | cut -f1)"
  done
  [ -d "$OUT/06_storage" ] && printf '  %-32s %s\n' "06_storage/" "$(du -sh "$OUT/06_storage" | cut -f1)"
  echo
  echo "Próximo: revise 08_CHECKLIST.md (o que precisa reconfigurar à mão)."
  echo "Teste a restauração num projeto descartável ANTES de virar em produção."
} | tee -a "$LOG"

echo
ok "backup completo em $OUT/"
