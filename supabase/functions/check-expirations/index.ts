import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-EXPIRATIONS] ${step}${detailsStr}`);
};

async function sendExpirationWarningEmail(
  email: string,
  username: string,
  expirationDate: string,
  trackingId: string,
  smtpPassword: string,
  supabaseUrl: string
): Promise<boolean> {
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

    const expDate = new Date(expirationDate).toLocaleDateString('pt-BR');
    const trackingPixelUrl = `${supabaseUrl}/functions/v1/email-tracking?tid=${trackingId}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); padding: 30px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .content { padding: 30px; background: #f9f9f9; }
    .warning-box { background: #fff3cd; border: 2px solid #ffc107; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
    .button { display: inline-block; background: #FFD700; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚠️ Seu Acesso Expira Amanhã!</h1>
  </div>
  <div class="content">
    <p>Olá!</p>
    
    <div class="warning-box">
      <h2 style="color: #856404; margin: 0;">⏰ Atenção!</h2>
      <p style="font-size: 18px; margin: 10px 0;">Seu acesso ao <strong>MRO</strong> expira em:</p>
      <p style="font-size: 28px; font-weight: bold; color: #dc3545; margin: 0;">${expDate}</p>
    </div>
    
    <p>Para continuar aproveitando todos os recursos da plataforma, renove seu acesso agora!</p>
    
    <p><strong>🚀 Novidades e novas funções foram adicionadas!</strong></p>
    
    <center>
      <a href="https://maisresultadosonline.com.br" class="button">🔄 RENOVAR MEU ACESSO</a>
    </center>
    
    <p style="color: #666; font-size: 14px;">
      Entre em contato conosco pelo WhatsApp: <strong>+55 51 9203-6540</strong>
    </p>
  </div>
  <div class="footer">
    <p>MRO - Mais Resultados Online</p>
    <p>Gabriel Fernandes da Silva | CNPJ: 54.840.738/0001-96</p>
  </div>
  <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>
    `;

    await client.send({
      from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: email,
      subject: "⚠️ Seu acesso MRO expira amanhã! Renove agora",
      content: `Seu acesso ao MRO expira em ${expDate}. Renove em maisresultadosonline.com.br`,
      html: htmlContent,
    });

    await client.close();
    logStep("Warning email sent", { to: email });
    return true;
  } catch (error: any) {
    logStep("Error sending warning email", { error: error?.message });
    return false;
  }
}

async function sendExpiredNotificationEmail(
  email: string,
  username: string,
  trackingId: string,
  smtpPassword: string,
  supabaseUrl: string
): Promise<boolean> {
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

    const trackingPixelUrl = `${supabaseUrl}/functions/v1/email-tracking?tid=${trackingId}_expired`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .content { padding: 30px; background: #f9f9f9; }
    .expired-box { background: #f8d7da; border: 2px solid #dc3545; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
    .button { display: inline-block; background: #28a745; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>❌ Seu Acesso Expirou</h1>
  </div>
  <div class="content">
    <p>Olá!</p>
    
    <div class="expired-box">
      <h2 style="color: #721c24; margin: 0;">Acesso Encerrado</h2>
      <p style="font-size: 16px; margin: 10px 0;">Seu acesso ao <strong>MRO</strong> expirou.</p>
    </div>
    
    <p>Mas não se preocupe! Você pode renovar agora e continuar aproveitando:</p>
    
    <ul>
      <li>✨ Todas as funcionalidades da plataforma</li>
      <li>🚀 Novas funções e atualizações</li>
      <li>📊 Ferramentas de crescimento para Instagram</li>
    </ul>
    
    <center>
      <a href="https://maisresultadosonline.com.br" class="button">🔄 RENOVAR AGORA</a>
    </center>
    
    <p style="color: #666; font-size: 14px;">
      Dúvidas? WhatsApp: <strong>+55 51 9203-6540</strong>
    </p>
  </div>
  <div class="footer">
    <p>MRO - Mais Resultados Online</p>
    <p>Gabriel Fernandes da Silva | CNPJ: 54.840.738/0001-96</p>
  </div>
  <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>
    `;

    await client.send({
      from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: email,
      subject: "❌ Seu acesso MRO expirou - Renove e continue crescendo!",
      content: `Seu acesso ao MRO expirou. Renove em maisresultadosonline.com.br`,
      html: htmlContent,
    });

    await client.close();
    logStep("Expired notification sent", { to: email });
    return true;
  } catch (error: any) {
    logStep("Error sending expired notification", { error: error?.message });
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");

    if (!smtpPassword) {
      return new Response(JSON.stringify({ error: "SMTP not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const results = {
      warningsSent: 0,
      expiredSent: 0,
      errors: 0,
      details: [] as Array<{ email: string; type: string; success: boolean }>,
    };

    // 1. Find accesses expiring tomorrow (1 day warning)
    logStep("Checking for accesses expiring tomorrow");
    const { data: expiringAccesses, error: expError } = await supabase
      .from('created_accesses')
      .select('*')
      .neq('access_type', 'lifetime')
      .eq('expiration_warning_sent', false)
      .not('expiration_date', 'is', null)
      .lte('expiration_date', tomorrow.toISOString())
      .gt('expiration_date', now.toISOString());

    if (expError) {
      logStep("Error fetching expiring accesses", { error: expError.message });
    } else if (expiringAccesses && expiringAccesses.length > 0) {
      logStep(`Found ${expiringAccesses.length} accesses expiring soon`);
      
      for (const access of expiringAccesses) {
        const trackingId = access.tracking_id || `track_${access.id}_${Date.now()}`;
        
        // Update tracking_id if not set
        if (!access.tracking_id) {
          await supabase
            .from('created_accesses')
            .update({ tracking_id: trackingId })
            .eq('id', access.id);
        }

        const sent = await sendExpirationWarningEmail(
          access.customer_email,
          access.username,
          access.expiration_date,
          trackingId,
          smtpPassword,
          supabaseUrl
        );

        if (sent) {
          await supabase
            .from('created_accesses')
            .update({
              expiration_warning_sent: true,
              expiration_warning_sent_at: new Date().toISOString(),
              tracking_id: trackingId,
            })
            .eq('id', access.id);
          
          results.warningsSent++;
          results.details.push({ email: access.customer_email, type: 'warning', success: true });
        } else {
          results.errors++;
          results.details.push({ email: access.customer_email, type: 'warning', success: false });
        }
      }
    }

    // 2. Find accesses that just expired
    logStep("Checking for expired accesses");
    const { data: expiredAccesses, error: expiredError } = await supabase
      .from('created_accesses')
      .select('*')
      .neq('access_type', 'lifetime')
      .eq('expired_notification_sent', false)
      .not('expiration_date', 'is', null)
      .lt('expiration_date', now.toISOString());

    if (expiredError) {
      logStep("Error fetching expired accesses", { error: expiredError.message });
    } else if (expiredAccesses && expiredAccesses.length > 0) {
      logStep(`Found ${expiredAccesses.length} expired accesses`);
      
      for (const access of expiredAccesses) {
        const trackingId = access.tracking_id || `track_${access.id}_${Date.now()}`;
        
        const sent = await sendExpiredNotificationEmail(
          access.customer_email,
          access.username,
          trackingId,
          smtpPassword,
          supabaseUrl
        );

        if (sent) {
          await supabase
            .from('created_accesses')
            .update({
              expired_notification_sent: true,
              expired_notification_sent_at: new Date().toISOString(),
            })
            .eq('id', access.id);
          
          results.expiredSent++;
          results.details.push({ email: access.customer_email, type: 'expired', success: true });
        } else {
          results.errors++;
          results.details.push({ email: access.customer_email, type: 'expired', success: false });
        }
      }
    }

    // 3. Process CRM 24h Countdown Triggers
    logStep("Processing CRM 24h Countdown Triggers");
    try {
      await supabase.functions.invoke('meta-whatsapp-crm', {
        body: { action: 'processCountdownTriggers' }
      });
      logStep("CRM Countdown triggers processed successfully");
    } catch (triggerError: any) {
      logStep("Error invoking CRM countdown triggers", { error: triggerError.message });
    }

    logStep("Check complete", results);

    return new Response(JSON.stringify({
      success: true,
      ...results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    logStep("ERROR", { message: error?.message });
    return new Response(JSON.stringify({ error: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
