/**
 * Exporta o secrets.env já preenchido com os valores acessíveis ao runtime.
 * Protegido pela mesma credencial administrativa do /admincentral.
 * Valores mascarados pela plataforma são listados para preenchimento manual.
 */


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REQUIRED: readonly { name: string; source: string }[] = [
  { name: "BRIGHTDATA_API_TOKEN", source: "painel Bright Data" },
  { name: "BRIGHTDATA_WEB_UNLOCKER_ZONE", source: "zona Web Unlocker da Bright Data" },
  { name: "DEEPSEEK_API_KEY", source: "painel DeepSeek" },
  { name: "FACEBOOK_APP_ID", source: "app da Meta" },
  { name: "FACEBOOK_APP_SECRET", source: "app da Meta" },
  { name: "GOOGLE_CLIENT_ID", source: "credencial OAuth do Google" },
  { name: "GOOGLE_CLIENT_SECRET", source: "credencial OAuth do Google" },
  { name: "GOOGLE_OAUTH_CLIENT_SECRET", source: "usar o mesmo secret OAuth do Google, se essa variável estiver ativa" },
  { name: "INFINITEPAY_API_KEY", source: "painel InfinitePay" },
  { name: "INFINITEPAY_WEBHOOK_SECRET", source: "configuração do webhook InfinitePay" },
  { name: "INSTAGRAM_SESSION_ID", source: "sessão da integração Instagram" },
  { name: "LOVABLE_API_KEY", source: "substituir por um provedor de IA disponível fora do Lovable Cloud" },
  { name: "META_CONVERSIONS_API_TOKEN", source: "Gerenciador de Eventos da Meta" },
  { name: "META_WEBHOOK_VERIFY_TOKEN", source: "usar exatamente o mesmo token configurado no webhook da Meta" },
  { name: "OPENAI_API_KEY", source: "painel OpenAI, caso as rotas de transcrição/IA continuem ativas" },
  { name: "RAPIDAPI_KEY", source: "painel RapidAPI" },
  { name: "SMTP_PASSWORD", source: "provedor SMTP correspondente" },
  { name: "STRIPE_SECRET_KEY", source: "painel Stripe, caso os produtos Stripe continuem ativos" },
  { name: "WPP_BOT_TOKEN", source: "provedor do bot WhatsApp" },
  { name: "ZAPMRO_SMTP_PASSWORD", source: "provedor de e-mail do ZapMRO" },
];

/**
 * Secrets gerados pela própria stack no VPS — exportados apenas como comentário
 * para evitar que alguém reaproveite chaves do ambiente antigo por engano.
 */
const REGENERATED: readonly string[] = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_JWKS",
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_SECRET_KEYS",
  "ADMIN_JWT_SECRET",
];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

const ADMIN_EMAIL = "mro@gmail.com";
const ADMIN_PASSWORD = "Ga145523@";

/** Valores injetados pela plataforma que não representam credenciais reais. */
function isUsable(value: string | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  const upper = v.toUpperCase();
  return !(
    upper === "PLACEHOLDER_VALUE" ||
    upper.startsWith("PLACEHOLDER") ||
    upper === "REDACTED" ||
    upper === "MASKED"
  );
}

function quote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse((await req.text()) || "{}");
    } catch {
      body = {};
    }

    const email = String(body.adminEmail ?? "").trim().toLowerCase();
    const password = String(body.adminPassword ?? "");
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return json({ error: "Credenciais administrativas inválidas" }, 401);
    }

    const found: string[] = [];
    const missing: string[] = [];

    const lines = REQUIRED.flatMap(({ name, source }) => {
      const value = Deno.env.get(name);
      if (isUsable(value)) {
        found.push(name);
        return [`${name}=${quote(value)}`];
      }
      missing.push(name);
      return [`# Obter em: ${source}`, `${name}=`];
    });

    const header = [
      "# ============================================================",
      "# secrets.env — ZapMRO (stack própria na VPS)",
      `# Data: ${new Date().toISOString()}`,
      "#",
      `# Preenchidos automaticamente: ${found.length} · Pendentes: ${missing.length}`,
      "# Use chmod 600 e NUNCA versione este arquivo no git.",
      "#",
      "# Uso: deploy/postgres-stack/secrets.env",
      "# ============================================================",
      "",
    ].join("\n");

    const footer = [
      "",
      "APP_BASE_URL='https://zapmro.com.br'",
      "SITE_URL='https://zapmro.com.br'",
      "",
      "# ------------------------------------------------------------",
      "# Gerados automaticamente pela stack própria (NÃO copie os antigos):",
      ...REGENERATED.map((n) => `#   ${n}`),
      "# ------------------------------------------------------------",
      "",
    ].join("\n");

    return json({
      success: true,
      content: header + lines.join("\n") + footer,
      found,
      missing,
      notice: missing.length
        ? "Alguns valores são mascarados pela plataforma no runtime e precisam ser colados manualmente na VPS."
        : "Todos os valores disponíveis foram exportados.",
    });
  } catch (err) {
    console.error("[export-secrets] erro:", err);
    return json({ error: "Erro interno" }, 500);
  }
});

