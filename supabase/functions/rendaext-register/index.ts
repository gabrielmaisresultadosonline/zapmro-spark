import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_CLASS_LINK = "https://maisresultadosonline.com.br/descontoalunosrendaextrass";
const BOT_SESSION_ID = "rendaext";

const log = (message: string, data?: any) => {
  console.log(`[RENDAEXT-REGISTER] ${message}`, data ? JSON.stringify(data) : '');
};

const sendEmailViaSMTP = async (to: string, subject: string, html: string) => {
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
        auth: { username: "suporte@maisresultadosonline.com.br", password: smtpPassword },
      },
    });
    await client.send({
      from: "MRO Renda Extra <suporte@maisresultadosonline.com.br>",
      to, subject, content: "auto", html,
    });
    await client.close();
    return true;
  } catch (error: unknown) {
    log('Email send error', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const data = await req.json();
    log("Registration request received", { email: data.email });

    const { data: lead, error: insertError } = await supabase
      .from("rendaext_leads")
      .insert({
        nome_completo: data.nome_completo,
        email: data.email,
        whatsapp: data.whatsapp,
        trabalha_atualmente: data.trabalha_atualmente,
        media_salarial: data.media_salarial,
        tipo_computador: data.tipo_computador,
        instagram_username: data.instagram_username,
      })
      .select().single();

    if (insertError) {
      return new Response(JSON.stringify({ success: false, error: insertError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    // Enqueue WhatsApp remarketing message in v2 bot tables
    try {
      const { data: botSettings } = await supabase
        .from("wpp_bot_settings_v2")
        .select("enabled, delay_minutes, message_template")
        .eq("id", BOT_SESSION_ID)
        .maybeSingle();

      if (botSettings?.enabled) {
        const rawPhone = String(data.whatsapp || "").replace(/\D/g, "");
        let phone: string | null = null;
        if (rawPhone.length === 13 && rawPhone.startsWith("55") && rawPhone[4] === "9") {
          phone = `${rawPhone.slice(0, 4)}${rawPhone.slice(5)}`;
        } else if (rawPhone.length >= 10) {
          phone = rawPhone;
        }
        if (phone) {
          const delayMin = Number(botSettings.delay_minutes) || 30;
          await supabase.from("wpp_bot_messages_v2").insert({
            lead_id: lead.id,
            lead_name: data.nome_completo,
            phone,
            message: botSettings.message_template,
            scheduled_for: new Date(Date.now() + delayMin * 60_000).toISOString(),
            status: "pending",
          });
        }
      }
    } catch (enqueueErr) {
      log("Failed to enqueue WhatsApp remarketing", { error: String(enqueueErr) });
    }

    const emailHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
<tr><td style="background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);padding:30px;text-align:center;">
<div style="background:#000;color:#fff;display:inline-block;padding:10px 25px;border-radius:8px;font-size:32px;font-weight:bold;">MRO</div>
<h1 style="color:#000;margin:15px 0 0 0;font-size:24px;">🎉 Sua aula grátis está liberada!</h1>
</td></tr>
<tr><td style="padding:30px;">
<p style="font-size:16px;">Olá <strong>${data.nome_completo}</strong>!</p>
<p style="font-size:16px;">Seu cadastro foi confirmado. Acesse agora a aula grátis:</p>
<div style="text-align:center;margin:30px 0;">
<a href="${FREE_CLASS_LINK}" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;padding:15px 40px;border-radius:30px;font-size:18px;font-weight:bold;">🎬 ACESSE AGORA A AULA GRÁTIS</a>
</div></td></tr>
<tr><td style="background:#1a1a1a;padding:20px;text-align:center;color:#999;font-size:12px;">© 2026 MRO - Mais Resultados Online</td></tr>
</table></body></html>`;

    const emailSent = await sendEmailViaSMTP(
      data.email,
      "🎬 Sua aula grátis + desconto liberado! - MRO",
      emailHtml
    );

    await supabase.from("rendaext_email_logs").insert({
      lead_id: lead.id,
      recipient_email: data.email,
      email_to: data.email,
      email_type: "confirmacao",
      subject: "Sua aula grátis + desconto liberado! - MRO",
      status: emailSent ? "sent" : "failed",
      error_message: emailSent ? null : "SMTP not configured or send failed",
    });

    if (emailSent) {
      await supabase.from("rendaext_leads").update({
        email_confirmacao_enviado: true,
        email_confirmacao_enviado_at: new Date().toISOString(),
      }).eq("id", lead.id);
    }

    return new Response(JSON.stringify({ success: true, leadId: lead.id, freeClassLink: FREE_CLASS_LINK, emailSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: errMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
