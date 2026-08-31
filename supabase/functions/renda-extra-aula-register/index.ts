import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sendEmailViaSMTP = async (to: string, subject: string, html: string) => {
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");
  if (!smtpPassword) return false;
  try {
    const client = new SMTPClient({
      connection: { hostname: "smtp.hostinger.com", port: 465, tls: true, auth: { username: "suporte@maisresultadosonline.com.br", password: smtpPassword } },
    });
    await client.send({ from: "MRO <suporte@maisresultadosonline.com.br>", to, subject, content: "auto", html });
    await client.close();
    return true;
  } catch (e) {
    console.error("SMTP error:", e);
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    // Track page view
    if (action === "trackPageView") {
      await supabase.from("renda_extra_aula_analytics").insert({
        event_type: "page_view",
        source_url: String(body.source_url || "").slice(0, 500),
        user_agent: String(body.user_agent || "").slice(0, 500),
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Register lead
    if (action === "register") {
      const nome = String(body.nome_completo || "").trim().slice(0, 100);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 255);
      const whatsapp = String(body.whatsapp || "").replace(/[^\d\s\(\)\-\+]/g, "").slice(0, 20);

      if (nome.length < 3) return new Response(JSON.stringify({ success: false, error: "Nome inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return new Response(JSON.stringify({ success: false, error: "Email inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const cleanedPhone = whatsapp.replace(/\D/g, "");
      if (cleanedPhone.length < 10 || cleanedPhone.length > 13) return new Response(JSON.stringify({ success: false, error: "WhatsApp inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Insert lead
      const { error: insertError } = await supabase.from("renda_extra_aula_leads").insert({ nome_completo: nome, email, whatsapp });
      if (insertError) throw insertError;

      // Track lead event
      await supabase.from("renda_extra_aula_analytics").insert({ event_type: "lead_registered" });

      // Build site URL for email link (back to our site, not YouTube)
      const siteOrigin = Deno.env.get("SITE_URL") || "https://maisresultadosonline.com.br";
      const aulaLink = `${siteOrigin}/rendaextraaula?email=${encodeURIComponent(email)}`;

      // Send email with lesson link
      const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#FFD700,#FFA500);padding:30px 20px;text-align:center;">
<div style="background-color:#000000;color:#ffffff;display:inline-block;padding:10px 25px;border-radius:8px;font-size:28px;font-weight:bold;">MRO</div>
<h1 style="color:#000000;margin:15px 0 0;font-size:22px;font-weight:bold;">&#127916; Sua Aula Gr&aacute;tis!</h1>
</td></tr>
<tr><td style="padding:30px 25px;">
<p style="font-size:16px;color:#333333;margin:0 0 15px;">Ol&aacute; <strong>${nome}</strong>!</p>
<p style="font-size:16px;color:#333333;margin:0 0 25px;line-height:1.5;">Sua aula gr&aacute;tis j&aacute; est&aacute; dispon&iacute;vel. Assista agora e descubra como faturar no m&iacute;nimo R$5.000/m&ecirc;s com a ferramenta MRO!</p>
<div style="text-align:center;margin:30px 0;">
<a href="${aulaLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#FFD700,#FFA500);color:#000000;text-decoration:none;padding:15px 40px;border-radius:30px;font-size:18px;font-weight:bold;">&#127916; ASSISTIR AULA AGORA</a>
</div>
</td></tr>
<tr><td style="background-color:#1a1a1a;padding:20px;text-align:center;">
<p style="margin:0;color:#999999;font-size:12px;">&copy; 2026 MRO - Mais Resultados Online</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

      const emailSent = await sendEmailViaSMTP(email, "🎬 Sua Aula Grátis - MRO", emailHtml);

      if (emailSent) {
        await supabase.from("renda_extra_aula_leads").update({ email_enviado: true, aula_liberada: true }).eq("email", email);
      } else {
        await supabase.from("renda_extra_aula_leads").update({ aula_liberada: true }).eq("email", email);
      }

      return new Response(JSON.stringify({ success: true, emailSent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin login
    if (action === "adminLogin") {
      const { data: settings } = await supabase.from("renda_extra_aula_settings").select("admin_email, admin_password").limit(1).single();
      if (!settings) return new Response(JSON.stringify({ success: false, error: "Configurações não encontradas" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (body.email === settings.admin_email && body.password === settings.admin_password) {
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: false, error: "Credenciais inválidas" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin get data
    if (action === "adminGetData") {
      const { data: leads } = await supabase.from("renda_extra_aula_leads").select("*").order("created_at", { ascending: false });
      const { data: orders } = await supabase.from("mro_orders").select("*").order("created_at", { ascending: false });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const { count: totalVisits } = await supabase.from("renda_extra_aula_analytics").select("*", { count: "exact", head: true }).eq("event_type", "page_view");
      const { count: todayVisits } = await supabase.from("renda_extra_aula_analytics").select("*", { count: "exact", head: true }).eq("event_type", "page_view").gte("created_at", todayIso);
      const { count: totalLeads } = await supabase.from("renda_extra_aula_leads").select("*", { count: "exact", head: true });
      const { count: todayLeads } = await supabase.from("renda_extra_aula_leads").select("*", { count: "exact", head: true }).gte("created_at", todayIso);
      
      const { count: totalPaid } = await supabase.from("mro_orders").select("*", { count: "exact", head: true }).eq("status", "completed");
      const { data: todayPaidData } = await supabase.from("mro_orders").select("amount").eq("status", "completed").gte("paid_at", todayIso);
      const todayRevenue = todayPaidData?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;

      return new Response(JSON.stringify({
        leads: leads || [],
        orders: orders || [],
        analytics: { 
          total_visits: totalVisits || 0, 
          today_visits: todayVisits || 0, 
          total_leads: totalLeads || 0, 
          today_leads: todayLeads || 0,
          total_paid: totalPaid || 0,
          today_revenue: todayRevenue
        }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
