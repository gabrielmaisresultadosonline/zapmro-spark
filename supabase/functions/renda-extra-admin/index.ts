import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, email, password, settings: newSettings } = await req.json();

    // Public settings (no auth required)
    if (action === "getPublicSettings") {
      const { data: settings } = await supabase
        .from("renda_extra_v2_settings")
        .select("launch_date")
        .limit(1)
        .single();

      return new Response(JSON.stringify({ success: true, launch_date: settings?.launch_date }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Login action
    if (action === "login") {
      const { data: settingsData } = await supabase
        .from("renda_extra_v2_settings")
        .select("admin_email, admin_password")
        .limit(1)
        .single();

      if (!settingsData) {
        return new Response(
          JSON.stringify({ success: false, error: "Configurações não encontradas" }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (email === settingsData.admin_email && password === settingsData.admin_password) {
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get all data action
    if (action === "getData") {
      // Get leads
      const { data: leads } = await supabase
        .from("renda_extra_leads")
        .select("*")
        .order("created_at", { ascending: false });

      // Get email logs
      const { data: emailLogs } = await supabase
        .from("renda_extra_email_logs")
        .select("*")
        .order("created_at", { ascending: false });

      // Get settings
      const { data: settings } = await supabase
        .from("renda_extra_v2_settings")
        .select("whatsapp_group_link, launch_date")
        .limit(1)
        .single();

      // Get analytics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const { count: totalVisits } = await supabase
        .from("renda_extra_analytics")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "page_view");

      const { count: todayVisits } = await supabase
        .from("renda_extra_analytics")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "page_view")
        .gte("created_at", todayIso);

      const { count: totalLeads } = await supabase
        .from("renda_extra_leads")
        .select("*", { count: "exact", head: true });

      const { count: todayLeads } = await supabase
        .from("renda_extra_leads")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayIso);

      return new Response(
        JSON.stringify({
          leads: leads || [],
          emailLogs: emailLogs || [],
          settings,
          analytics: {
            total_visits: totalVisits || 0,
            today_visits: todayVisits || 0,
            total_leads: totalLeads || 0,
            today_leads: todayLeads || 0
          }
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update settings action
    if (action === "updateSettings") {
      const { error } = await supabase
        .from("renda_extra_v2_settings")
        .update({
          whatsapp_group_link: newSettings.whatsapp_group_link,
          launch_date: newSettings.launch_date,
          updated_at: new Date().toISOString()
        })
        .not("id", "is", null);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Reset analytics action
    if (action === "resetAnalytics") {
      const { error } = await supabase
        .from("renda_extra_analytics")
        .delete()
        .not("id", "is", null);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: "Analytics zerado com sucesso" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in renda-extra-admin:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
