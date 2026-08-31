import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (msg: string, data?: any) => {
  console.log(`[RENDAEXTRALIGACAO] ${msg}`, data ? JSON.stringify(data) : '');
};

const sendEmailViaSMTP = async (to: string, nome: string, groupLink: string) => {
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");
  if (!smtpPassword) {
    log("SMTP password not configured, skipping email");
    return false;
  }

  try {
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.hostinger.com",
        port: 465,
        tls: true,
        auth: {
          username: "suporte@maisresultadosonline.com.br",
          password: smtpPassword,
        },
      },
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<tr><td style="background:#FFD700;padding:25px;text-align:center;">
<table cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="background:#000;color:#fff;padding:8px 20px;border-radius:6px;font-size:28px;font-weight:bold;letter-spacing:2px;">MRO</td></tr></table>
<p style="color:#000;margin:12px 0 0;font-size:20px;font-weight:bold;">Parabens! Seu acesso foi liberado!</p>
</td></tr>

<tr><td style="padding:30px;">

<p style="font-size:16px;color:#333;margin:0 0 20px;">Ola <strong>${nome}</strong>,</p>

<p style="font-size:16px;color:#333;margin:0 0 15px;">Ficamos muito felizes em receber seu cadastro! Agora voce tem acesso ao nosso grupo exclusivo da <strong>Live de Sexta-Feira</strong>.</p>

<p style="font-size:16px;color:#333;margin:0 0 15px;">Nessa live, voce vai aprender:</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
<tr><td style="padding:6px 0;font-size:15px;color:#333;">&#10148; Como faturar <strong>5k ou mais</strong> de renda extra</td></tr>
<tr><td style="padding:6px 0;font-size:15px;color:#333;">&#10148; Como a ferramenta <strong>automatica MRO</strong> funciona</td></tr>
<tr><td style="padding:6px 0;font-size:15px;color:#333;">&#10148; Resultados reais de nossos <strong>membros</strong></td></tr>
<tr><td style="padding:6px 0;font-size:15px;color:#333;">&#10148; Passo a passo para <strong>comecar hoje</strong></td></tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 15px;border-radius:0 6px 6px 0;">
<p style="margin:0;color:#856404;font-size:14px;"><strong>Importante:</strong> Entre no grupo do WhatsApp agora para nao perder a live. As vagas sao limitadas!</p>
</td></tr></table>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:25px 0;"><tr><td align="center">
<a href="${groupLink}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:15px 40px;border-radius:25px;font-size:16px;font-weight:bold;">ENTRAR NO GRUPO DA LIVE</a>
</td></tr></table>

<p style="font-size:13px;color:#999;text-align:center;margin:15px 0 0;">Fique atento ao grupo, e por la que avisaremos quando a live comecar!</p>

</td></tr>

<tr><td style="background:#222;padding:20px;text-align:center;">
<p style="color:#FFD700;margin:0 0 8px;font-weight:bold;font-size:14px;">Bem-vindo a familia MRO!</p>
<p style="color:#888;margin:0;font-size:11px;">MRO - Mais Resultados Online</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    await client.send({
      from: "MRO Renda Extra <suporte@maisresultadosonline.com.br>",
      to: to,
      subject: "LIVE GRATIS - Faca 5k mensal com a MRO! Participe agora",
      content: "Seu acesso foi liberado! Entre no grupo: " + groupLink,
      html: htmlContent,
    });

    await client.close();
    log('Email sent successfully', { to });
    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log('Email send error', { error: errMsg });
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, settings, lead } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const BUCKET = "user-data";
    const FILE_PATH = "rendaextraligacao/settings.json";
    const LEADS_PATH = "rendaextraligacao/leads.json";
    const STATS_PATH = "rendaextraligacao/stats.json";

    if (action === "load") {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(FILE_PATH);

      if (error || !data) {
        return new Response(
          JSON.stringify({ success: true, data: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const text = await data.text();
      const parsed = JSON.parse(text);

      return new Response(
        JSON.stringify({ success: true, data: parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save") {
      const jsonStr = JSON.stringify(settings);
      const blob = new Blob([jsonStr], { type: "application/json" });

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, blob, { upsert: true, contentType: "application/json" });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "track_no_notebook") {
      let stats = { no_notebook_count: 0 };
      try {
        const { data: statsData } = await supabase.storage.from(BUCKET).download(STATS_PATH);
        if (statsData) {
          const text = await statsData.text();
          stats = JSON.parse(text);
        }
      } catch (_) {}

      stats.no_notebook_count = (stats.no_notebook_count || 0) + 1;

      const blob = new Blob([JSON.stringify(stats)], { type: "application/json" });
      await supabase.storage.from(BUCKET).upload(STATS_PATH, blob, { upsert: true, contentType: "application/json" });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "register_lead") {
      let existingLeads: any[] = [];
      
      try {
        const { data: leadsData } = await supabase.storage.from(BUCKET).download(LEADS_PATH);
        if (leadsData) {
          const text = await leadsData.text();
          existingLeads = JSON.parse(text);
        }
      } catch (_) {}

      existingLeads.push({
        ...lead,
        created_at: new Date().toISOString(),
      });

      const leadsBlob = new Blob([JSON.stringify(existingLeads)], { type: "application/json" });
      await supabase.storage.from(BUCKET).upload(LEADS_PATH, leadsBlob, { upsert: true, contentType: "application/json" });

      // Load settings to get group link
      let groupLink = "https://chat.whatsapp.com/KIDNoL8cBlnFrHlifBqU7X";
      try {
        const { data: settingsData } = await supabase.storage.from(BUCKET).download(FILE_PATH);
        if (settingsData) {
          const text = await settingsData.text();
          const s = JSON.parse(text);
          if (s.groupLink) groupLink = s.groupLink;
        }
      } catch (_) {}

      // Send welcome email via SMTP
      const emailSent = await sendEmailViaSMTP(lead.email, lead.nome || "Participante", groupLink);
      log("Lead registered", { email: lead.email, emailSent });

      return new Response(
        JSON.stringify({ success: true, emailSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "load_leads") {
      let leads: any[] = [];
      let stats = { no_notebook_count: 0 };

      try {
        const { data: leadsData } = await supabase.storage.from(BUCKET).download(LEADS_PATH);
        if (leadsData) {
          const text = await leadsData.text();
          leads = JSON.parse(text);
        }
      } catch (_) {}

      try {
        const { data: statsData } = await supabase.storage.from(BUCKET).download(STATS_PATH);
        if (statsData) {
          const text = await statsData.text();
          stats = JSON.parse(text);
        }
      } catch (_) {}

      return new Response(
        JSON.stringify({ success: true, leads, stats }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});