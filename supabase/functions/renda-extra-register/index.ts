import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (message: string, data?: any) => {
  console.log(`[RENDA-EXTRA-REGISTER] ${message}`, data ? JSON.stringify(data) : '');
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
        auth: {
          username: "suporte@maisresultadosonline.com.br",
          password: smtpPassword,
        },
      },
    });

    await client.send({
      from: "MRO Renda Extra <suporte@maisresultadosonline.com.br>",
      to: to,
      subject: subject,
      content: "auto",
      html: html,
    });

    await client.close();
    log('Email sent successfully', { to, subject });
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const data = await req.json();
    log("Registration request received", { email: data.email, nome: data.nome_completo });

    // Insert lead into database
    const { data: lead, error: insertError } = await supabase
      .from("renda_extra_leads")
      .insert({
        nome_completo: data.nome_completo,
        email: data.email,
        whatsapp: data.whatsapp,
        trabalha_atualmente: data.trabalha_atualmente,
        media_salarial: data.media_salarial,
        tipo_computador: data.tipo_computador,
        instagram_username: data.instagram_username,
      })
      .select()
      .single();

    if (insertError) {
      log("Error inserting lead", { error: insertError });
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    log("Lead inserted successfully", { leadId: lead.id });

    // Get settings for WhatsApp group link
    const { data: settings } = await supabase
      .from("renda_extra_v2_settings")
      .select("whatsapp_group_link, launch_date")
      .single();

    const whatsappGroupLink = settings?.whatsapp_group_link || "https://chat.whatsapp.com/example";
    const launchDate = settings?.launch_date ? new Date(settings.launch_date).toLocaleDateString('pt-BR') : "21/01/2026";

    // Send confirmation email via SMTP
    const emailHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
<tr>
<td style="background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);padding:30px;text-align:center;">
<div style="background:#000;color:#fff;display:inline-block;padding:10px 25px;border-radius:8px;font-size:32px;font-weight:bold;letter-spacing:2px;margin-bottom:10px;">MRO</div>
<h1 style="color:#000;margin:15px 0 0 0;font-size:24px;">🎉 Recebemos seu Interesse!</h1>
</td>
</tr>
<tr>
<td style="padding:30px;background:#ffffff;">

<div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:20px;border-radius:10px;margin-bottom:25px;text-align:center;">
<p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">✨ Parabéns por dar o primeiro passo!</p>
</div>

<p style="margin:0 0 20px 0;font-size:16px;">Olá <strong>${data.nome_completo}</strong>!</p>

<p style="margin:0 0 20px 0;font-size:16px;">Ficamos muito felizes em receber seu cadastro para o lançamento do <strong>Método MRO de Renda Extra</strong>!</p>

<div style="background:#f8f9fa;padding:20px;border-radius:10px;margin:25px 0;border-left:4px solid #FFD700;">
<p style="margin:0 0 10px 0;font-size:16px;font-weight:bold;">📅 Data do Lançamento:</p>
<p style="margin:0;font-size:20px;color:#000;font-weight:bold;">${launchDate}</p>
</div>

<div style="text-align:center;margin:30px 0;">
<p style="margin:0 0 15px 0;font-size:16px;font-weight:bold;">Entre no nosso grupo do WhatsApp:</p>
<a href="${whatsappGroupLink}" style="display:inline-block;background:linear-gradient(135deg,#25D366 0%,#128C7E 100%);color:#fff;text-decoration:none;padding:15px 40px;border-radius:30px;font-size:18px;font-weight:bold;">
📲 PARTICIPAR DO GRUPO
</a>
</div>

<p style="margin:20px 0;font-size:14px;color:#666;text-align:center;">
Fique atento! Você receberá um email de lembrete no dia do lançamento.
</p>

</td>
</tr>
<tr>
<td style="background:#1a1a1a;padding:20px;text-align:center;">
<p style="margin:0;color:#999;font-size:12px;">© 2026 MRO - Mais Resultados Online</p>
<p style="margin:10px 0 0 0;color:#666;font-size:11px;">Este email foi enviado porque você se cadastrou na página de Renda Extra.</p>
</td>
</tr>
</table>
</body>
</html>`;

    const emailSent = await sendEmailViaSMTP(
      data.email,
      "🎉 Recebemos seu interesse! - MRO Renda Extra",
      emailHtml
    );

    // Log email in database
    await supabase
      .from("renda_extra_email_logs")
      .insert({
        lead_id: lead.id,
        email_to: data.email,
        email_type: "confirmacao",
        subject: "Recebemos seu interesse! - MRO Renda Extra",
        status: emailSent ? "sent" : "failed",
        error_message: emailSent ? null : "SMTP not configured or send failed",
      });

    // Update lead with email sent status
    if (emailSent) {
      await supabase
        .from("renda_extra_leads")
        .update({
          email_confirmacao_enviado: true,
          email_confirmacao_enviado_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        leadId: lead.id,
        whatsappGroupLink,
        emailSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log("Error processing registration", { error: errMsg });
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
