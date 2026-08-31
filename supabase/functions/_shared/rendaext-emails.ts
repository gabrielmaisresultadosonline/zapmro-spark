import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";


export const buildRendaExtEmail = (name: string) => `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
<tr><td style="background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);padding:30px;text-align:center;">
<div style="background:#000;color:#fff;display:inline-block;padding:10px 25px;border-radius:8px;font-size:32px;font-weight:bold;">MRO</div>
<h1 style="color:#000;margin:15px 0 0 0;font-size:24px;">🎉 Aula Liberada!</h1>
</td></tr>
<tr><td style="padding:30px;color:#333;">
<p style="font-size:16px;">Olá <strong>${name}</strong>!</p>
<p style="font-size:16px;">Parabéns pelo interesse, você é um dos empreendedores de sucesso que a partir de agora vai aprender o novo método.</p>
<div style="background:#f8f9fa;border-left:4px solid #FFD700;padding:20px;margin:20px 0;border-radius:8px;">
<p style="margin:0 0 10px 0;font-weight:bold;font-size:18px;">📚 Acesse sua aula aqui:</p>
<a href="https://maisresultadosonline.com.br/descontoalunosrendaextrass" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;padding:15px 40px;border-radius:30px;font-size:16px;font-weight:bold;margin-top:10px;">▶️ ACESSAR AULA AGORA</a>
</div>
<div style="background:#e8f5e9;border-left:4px solid #4caf50;padding:15px;margin:20px 0;border-radius:8px;">
<p style="margin:0;font-size:14px;color:#2e7d32;"><strong>Suporte WhatsApp:</strong> <a href="https://maisresultadosonline.com.br/whatsapp" style="color:#2e7d32;">Clique aqui para suporte</a></p>
</div>
<p style="font-size:14px;color:#666;margin-top:30px;"><strong>Aplique HOJE mesmo!</strong> Quanto antes começar, antes verá resultados.</p>
</td></tr>
<tr><td style="background:#1a1a1a;padding:20px;text-align:center;color:#999;font-size:12px;">© 2026 MRO - Mais Resultados Online</td></tr>
</table></body></html>`;

export const sendRendaExtEmail = async (to: string, name: string): Promise<boolean> => {
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

  if (!smtpPassword) {
    console.error("[RENDAEXT-EMAIL] SMTP_PASSWORD not set");
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
    
    const subject = "✅ Aula Liberada! Parabéns pelo interesse";
    await client.send({
      from: "MRO <suporte@maisresultadosonline.com.br>",
      to,
      subject,
      content: "auto",
      html: buildRendaExtEmail(name),
    });
    
    await client.close();

    if (supabase) {
      await supabase.from("rendaext_email_logs").insert({
        email_to: to,
        email_type: "aula_liberada",
        subject,
        status: "sent"
      });
    }

    return true;
  } catch (e) {
    const errorMsg = String(e);
    console.error("[RENDAEXT-EMAIL] Error sending email:", errorMsg);
    
    if (supabase) {
      await supabase.from("rendaext_email_logs").insert({
        email_to: to,
        email_type: "aula_liberada",
        subject: "✅ Aula Liberada! Parabéns pelo interesse",
        status: "error",
        error_message: errorMsg
      });
    }

    return false;
  }
};

