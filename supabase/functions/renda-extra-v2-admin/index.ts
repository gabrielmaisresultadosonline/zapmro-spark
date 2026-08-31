import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://esm.sh/zod@3.25.76";
import { createAdminSessionToken, verifyAdminSessionToken } from "../_shared/admin-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LoginSchema = z.object({
  action: z.literal("login"),
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
});

const UpdateSettingsSchema = z.object({
  action: z.literal("updateSettings"),
  settings: z.object({
    whatsapp_group_link: z.string().trim().max(500).nullable().optional(),
    launch_date: z.string().datetime().nullable().optional(),
  }),
  adminToken: z.string().optional(),
});

const ProtectedActionSchema = z.object({
  action: z.enum(["getData", "resetAnalytics"]),
  adminToken: z.string().optional(),
});

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function requireAdminSession(req: Request, body: Record<string, unknown>, secret: string) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = typeof body.adminToken === "string" ? body.adminToken : bearer;
  return verifyAdminSessionToken(token, secret, "renda-extra-v2-admin");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Backend configuration is missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const body = await readJson(req) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    console.log(`[renda-extra-v2-admin] Action: ${action}`);

    if (action === "getPublicSettings") {
      const { data: settings } = await supabase
        .from("renda_extra_v2_settings")
        .select("launch_date")
        .limit(1)
        .single();

      return new Response(JSON.stringify({ success: true, launch_date: settings?.launch_date ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsRow } = await supabase
      .from("renda_extra_v2_settings")
      .select("admin_email, admin_password")
      .limit(1)
      .single();

    if (!settingsRow) {
      return new Response(JSON.stringify({ success: false, error: "Configurações não encontradas" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionSecret = `${settingsRow.admin_email.trim().toLowerCase()}:${settingsRow.admin_password.trim()}`;

    if (action === "login") {
      const parsed = LoginSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ success: false, error: "Credenciais inválidas" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedEmail = parsed.data.email.trim().toLowerCase();
      const normalizedPassword = parsed.data.password.trim();

      if (
        normalizedEmail !== settingsRow.admin_email.trim().toLowerCase() ||
        normalizedPassword !== settingsRow.admin_password.trim()
      ) {
        return new Response(JSON.stringify({ success: false, error: "Credenciais inválidas" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminToken = await createAdminSessionToken(
        { email: normalizedEmail, scope: "renda-extra-v2-admin", exp: Date.now() + 1000 * 60 * 60 * 12 },
        sessionSecret,
      );

      return new Response(JSON.stringify({ success: true, adminToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await requireAdminSession(req, body, sessionSecret);
    if (!session) {
      return new Response(JSON.stringify({ success: false, error: "Sessão expirada. Faça login novamente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "getData") {
      const parsed = ProtectedActionSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ success: false, error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [leadsRes, emailLogsRes, settingsRes, totalVisitsRes, todayVisitsRes, totalLeadsRes, todayLeadsRes] = await Promise.all([
        supabase.from("renda_extra_v2_leads").select("*").order("created_at", { ascending: false }),
        supabase.from("renda_extra_v2_email_logs").select("*").order("created_at", { ascending: false }),
        supabase.from("renda_extra_v2_settings").select("whatsapp_group_link, launch_date").limit(1).single(),
        supabase.from("renda_extra_v2_analytics").select("*", { count: "exact", head: true }).eq("event_type", "page_view"),
        supabase.from("renda_extra_v2_analytics").select("*", { count: "exact", head: true }).eq("event_type", "page_view").gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
        supabase.from("renda_extra_v2_leads").select("*", { count: "exact", head: true }),
        supabase.from("renda_extra_v2_leads").select("*", { count: "exact", head: true }).gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
      ]);

      return new Response(JSON.stringify({
        success: true,
        leads: leadsRes.data || [],
        emailLogs: emailLogsRes.data || [],
        settings: settingsRes.data || null,
        analytics: {
          total_visits: totalVisitsRes.count || 0,
          today_visits: todayVisitsRes.count || 0,
          total_leads: totalLeadsRes.count || 0,
          today_leads: todayLeadsRes.count || 0,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "updateSettings") {
      const parsed = UpdateSettingsSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ success: false, error: "Dados de configuração inválidos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = {
        whatsapp_group_link: parsed.data.settings.whatsapp_group_link?.trim() || null,
        launch_date: parsed.data.settings.launch_date || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("renda_extra_v2_settings").update(payload).not("id", "is", null);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resetAnalytics") {
      const parsed = ProtectedActionSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ success: false, error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("renda_extra_v2_analytics").delete().not("id", "is", null);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, message: "Analytics zerado com sucesso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in renda-extra-v2-admin:", message);
    return new Response(JSON.stringify({ success: false, error: "Falha ao processar a solicitação" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
