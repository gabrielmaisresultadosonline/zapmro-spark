import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://esm.sh/zod@3.25.76";
import { verifyAdminSessionToken } from "../_shared/admin-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-token",
};

const SESSION_ID = "rendaext";
const SESSIONS_TABLE = "wpp_bot_session_v2";
const SETTINGS_TABLE = "wpp_bot_settings_v2";
const MESSAGES_TABLE = "wpp_bot_messages_v2";

const DEFAULT_SETTINGS = {
  id: SESSION_ID,
  enabled: true,
  delay_minutes: 30,
  message_template: "Olá! Vi seu cadastro e queria te explicar melhor como funciona.",
};
const DEFAULT_SESSION = {
  id: SESSION_ID,
  status: "disconnected",
  request_qr: false,
  request_logout: false,
  qr_code: null,
  phone_number: null,
  last_heartbeat: null,
};

const AdminActionSchema = z.object({
  action: z.enum(["getStatus", "requestQr", "logout", "saveSettings", "retryMessage", "deleteMessage", "enqueueLead", "sendNow", "sendTest"]),
  adminToken: z.string().optional(),
  message_template: z.string().max(4000).optional(),
  delay_minutes: z.coerce.number().int().min(1).max(10080).optional(),
  enabled: z.boolean().optional(),
  message_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  lead_name: z.string().max(255).nullable().optional(),
  phone: z.string().max(40).optional(),
});

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function normalizePhone(raw: string | undefined) {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    digits = `${digits.slice(0, 4)}${digits.slice(5)}`;
  }
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    digits = `${digits.slice(0, 4)}${digits.slice(5)}`;
  }
  return digits;
}

async function ensureRecords(supabase: ReturnType<typeof createClient>) {
  const { data: session } = await supabase.from(SESSIONS_TABLE).select("id").eq("id", SESSION_ID).maybeSingle();
  if (!session) await supabase.from(SESSIONS_TABLE).insert(DEFAULT_SESSION);
  const { data: settings } = await supabase.from(SETTINGS_TABLE).select("id").eq("id", SESSION_ID).maybeSingle();
  if (!settings) await supabase.from(SETTINGS_TABLE).insert(DEFAULT_SETTINGS);
}

async function loadSessionSecret(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("rendaext_settings").select("admin_email, admin_password").limit(1).single();
  if (!data) return null;
  return `${data.admin_email}:${data.admin_password}`;
}

async function isAuthorizedAdmin(req: Request, body: Record<string, unknown>, secret: string | null) {
  if (!secret) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = typeof body.adminToken === "string" ? body.adminToken : bearer;
  return !!(await verifyAdminSessionToken(token, secret, "rendaext-admin"));
}

const handler = async (req: Request): Promise<Response> => {
  const start = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return json({ success: false, error: "Backend configuration is missing" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  try {
    const body = await readBody(req) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const headerToken = req.headers.get("x-bot-token");
    const botToken = Deno.env.get("WPP_BOT_TOKEN");
    
    let isAuthorized = false;
    let adminAuthorized = false;

    if (botToken && headerToken === botToken) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      const adminSecret = await loadSessionSecret(supabase);
      adminAuthorized = await isAuthorizedAdmin(req, body, adminSecret);
      isAuthorized = adminAuthorized;
    }

    if (["botHeartbeat", "botFetchPending", "botUpdateMessage", "botAckCommand"].includes(action)) {
      if (!isAuthorized) return json({ success: false, error: "Unauthorized bot request" }, 401);

      if (action === "botHeartbeat") {
        const update: Record<string, unknown> = {
          last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (typeof body.status === "string") update.status = body.status;
        if (body.qr_code !== undefined) update.qr_code = body.qr_code;
        if (body.phone_number !== undefined) update.phone_number = body.phone_number;
        if (body.status === "connected") {
          update.request_qr = false;
          update.qr_code = null;
        }
        await supabase.from(SESSIONS_TABLE).update(update).eq("id", SESSION_ID);
        return json({ success: true }, 200, start);
      }

      if (action === "botFetchPending") {
        const { data: messages } = await supabase
          .from(MESSAGES_TABLE)
          .select("*")
          .eq("status", "pending")
          .lte("scheduled_for", new Date().toISOString())
          .order("scheduled_for", { ascending: true })
          .limit(10);

        const { data: session } = await supabase
          .from(SESSIONS_TABLE)
          .select("request_qr, request_logout")
          .eq("id", SESSION_ID).single();

        return json({ success: true, messages: messages || [], commands: session || {} }, 200, start);
      }

      if (action === "botUpdateMessage") {
        const update: Record<string, unknown> = {
          status: body.status,
          error_message: body.error_message || null,
          updated_at: new Date().toISOString(),
        };
        if (body.status === "sent") update.sent_at = new Date().toISOString();
        await supabase.from(MESSAGES_TABLE).update(update).eq("id", body.message_id);
        return json({ success: true }, 200, start);
      }

      if (action === "botAckCommand") {
        const update: Record<string, unknown> = {};
        if (body.cleared === "qr") update.request_qr = false;
        if (body.cleared === "logout") {
          update.request_logout = false;
          update.status = "disconnected";
          update.qr_code = null;
          update.phone_number = null;
        }
        await supabase.from(SESSIONS_TABLE).update(update).eq("id", SESSION_ID);
        return json({ success: true }, 200, start);
      }
    }

    const parsed = AdminActionSchema.safeParse(body);
    if (!parsed.success) return json({ success: false, error: "Dados inválidos" }, 400);
    if (!adminAuthorized) return json({ success: false, error: "Sessão expirada. Faça login novamente." }, 401);

    if (parsed.data.action === "getStatus") {
      const [{ data: session }, { data: settings }, { data: messages }] = await Promise.all([
        supabase.from(SESSIONS_TABLE).select("*").eq("id", SESSION_ID).maybeSingle(),
        supabase.from(SETTINGS_TABLE).select("*").eq("id", SESSION_ID).maybeSingle(),
        supabase.from(MESSAGES_TABLE).select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      return json({ success: true, session, settings, messages: messages || [] });
    }

    if (parsed.data.action === "requestQr") {
      await supabase.from(SESSIONS_TABLE).update({
        request_qr: true,
        request_logout: false,
        status: "connecting",
        qr_code: null,
        updated_at: new Date().toISOString(),
      }).eq("id", SESSION_ID);
      return json({ success: true });
    }

    if (parsed.data.action === "logout") {
      await supabase.from(SESSIONS_TABLE).update({ request_logout: true, updated_at: new Date().toISOString() }).eq("id", SESSION_ID);
      return json({ success: true });
    }

    if (parsed.data.action === "saveSettings") {
      await supabase.from(SETTINGS_TABLE).update({
        message_template: parsed.data.message_template ?? DEFAULT_SETTINGS.message_template,
        delay_minutes: parsed.data.delay_minutes ?? DEFAULT_SETTINGS.delay_minutes,
        enabled: parsed.data.enabled ?? true,
        updated_at: new Date().toISOString(),
      }).eq("id", SESSION_ID);
      return json({ success: true });
    }

    if (parsed.data.action === "enqueueLead") {
      const phone = normalizePhone(parsed.data.phone);
      if (!phone) return json({ success: true, skipped: true, reason: "invalid_phone" });
      const { data: settings } = await supabase.from(SETTINGS_TABLE).select("*").eq("id", SESSION_ID).maybeSingle();
      if (!settings?.enabled) return json({ success: true, skipped: true, reason: "disabled" });
      await supabase.from(MESSAGES_TABLE).insert({
        lead_id: parsed.data.lead_id || null,
        lead_name: parsed.data.lead_name || null,
        phone,
        message: settings.message_template,
        scheduled_for: new Date(Date.now() + (settings.delay_minutes || 30) * 60_000).toISOString(),
        status: "pending",
      });
      return json({ success: true });
    }

    if (parsed.data.action === "retryMessage" && parsed.data.message_id) {
      await supabase.from(MESSAGES_TABLE).update({
        status: "pending", error_message: null,
        scheduled_for: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", parsed.data.message_id);
      return json({ success: true });
    }

    if (parsed.data.action === "deleteMessage" && parsed.data.message_id) {
      await supabase.from(MESSAGES_TABLE).delete().eq("id", parsed.data.message_id);
      return json({ success: true });
    }

    if (parsed.data.action === "sendNow" && parsed.data.message_id) {
      await supabase.from(MESSAGES_TABLE).update({
        status: "pending", error_message: null,
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", parsed.data.message_id);
      return json({ success: true });
    }

    if (parsed.data.action === "sendTest") {
      const phone = normalizePhone(parsed.data.phone);
      if (!phone) return json({ success: false, error: "Número inválido" }, 400);
      const { data: settings } = await supabase.from(SETTINGS_TABLE).select("*").eq("id", SESSION_ID).maybeSingle();
      await supabase.from(MESSAGES_TABLE).insert({
        lead_id: null,
        lead_name: parsed.data.lead_name || "TESTE",
        phone,
        message: parsed.data.message_template || settings?.message_template || "Teste",
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: "pending",
      });
      return json({ success: true, phone });
    }

    return json({ success: false, error: "Ação inválida" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("wpp-bot-admin-v2 error", message);
    return json({ success: false, error: "Falha ao processar a solicitação" }, 500);
  }
};

function json(data: unknown, status = 200, startTime?: number) {
  if (startTime) {
    const duration = Date.now() - startTime;
    if (duration > 1000) console.warn(`Slow response: ${duration}ms`);
  }
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(handler);
