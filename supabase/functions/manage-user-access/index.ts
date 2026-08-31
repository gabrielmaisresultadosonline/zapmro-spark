import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MANAGE-USER-ACCESS] ${step}${detailsStr}`);
};

const WHATSAPP_API_URL = 'https://mrozap.squareweb.app';
const INSTAGRAM_API_URL = 'https://dashboardmroinstagramvini-online.squareweb.app';

// Send email via SMTP
async function sendAccessEmail(
  customerEmail: string,
  customerName: string,
  username: string,
  password: string,
  serviceType: string,
  accessType?: string,
  expirationDate?: string | null
): Promise<boolean> {
  try {
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) {
      logStep("SMTP password not configured");
      return false;
    }

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

    const serviceName = serviceType === 'whatsapp' ? 'ZAPMRO' : 'MRO Instagram';
    const memberAreaUrl = 'https://maisresultadosonline.com.br';

    const whatsappGroupLink = 'https://chat.whatsapp.com/JdEHa4jeLSUKTQFCNp7YXi';

    const htmlContent = `<!DOCTYPE html>
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
<h1 style="color:#000;margin:15px 0 0 0;font-size:24px;">🎉 Acesso Liberado!</h1>
</td>
</tr>
<tr>
<td style="padding:30px;background:#ffffff;">
<p style="margin:0 0 15px 0;">Olá${customerName ? ` <strong>${customerName}</strong>` : ''},</p>
<p style="margin:0 0 20px 0;">Seu acesso ao <strong>${serviceName}</strong> foi liberado com sucesso!</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #FFD700;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<h3 style="color:#333;margin:0 0 15px 0;font-size:16px;">📋 Seus Dados de Acesso:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:12px;background:#f8f9fa;border-radius:5px;margin-bottom:10px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<span style="font-size:12px;color:#666;display:block;">Usuário:</span>
<span style="font-size:18px;color:#000;font-family:monospace;font-weight:bold;">${username}</span>
</td>
<td width="40" style="text-align:right;vertical-align:middle;">
<span style="font-size:18px;" title="Copie o usuário">📋</span>
</td>
</tr>
</table>
</td>
</tr>
<tr><td style="height:10px;"></td></tr>
<tr>
<td style="padding:12px;background:#f8f9fa;border-radius:5px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<span style="font-size:12px;color:#666;display:block;">Senha:</span>
<span style="font-size:18px;color:#000;font-family:monospace;font-weight:bold;">${password}</span>
</td>
<td width="40" style="text-align:right;vertical-align:middle;">
<span style="font-size:18px;" title="Copie a senha">📋</span>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>
</table>
{EXPIRATION_SECTION}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<h3 style="color:#333;margin:0 0 15px 0;font-size:16px;">📝 Passo a Passo:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">1</span>
<span style="color:#333;">Acesse nossa página oficial clicando no botão abaixo</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">2</span>
<span style="color:#333;">Clique no botão <strong>"Área de Membros"</strong></span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">3</span>
<span style="color:#333;">Insira seu <strong>usuário</strong> e <strong>senha</strong> informados acima</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#25D366;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">✓</span>
<span style="color:#333;font-weight:bold;">Pronto! Tudo certo!</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;">
<span style="display:inline-block;background:#000;color:#FFD700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">🎬</span>
<span style="color:#333;font-weight:bold;">Agora acesse os vídeos e utilize à vontade!</span>
</td>
</tr>
</table>
</td>
</tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:10px 0;">
<a href="${memberAreaUrl}" style="display:inline-block;background:#000;color:#fff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">🚀 ACESSAR PÁGINA OFICIAL</a>
</td>
</tr>
</table>
<p style="color:#666;font-size:13px;text-align:center;margin:15px 0;">Ou acesse: <a href="${memberAreaUrl}" style="color:#000;">${memberAreaUrl}</a></p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:25px;">
<tr>
<td align="center">
<a href="${whatsappGroupLink}" style="display:inline-block;background:#25D366;color:#fff;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">📱 GRUPO DE AVISOS WHATSAPP</a>
</td>
</tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;">
<tr>
<td align="center">
<a href="https://maisresultadosonline.com.br/whatsapp" style="display:inline-block;background:#128C7E;color:#fff;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">📱 Falar no WhatsApp com Suporte</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="text-align:center;padding:20px;background:#f8f9fa;color:#666;font-size:11px;">
<p style="margin:0;">MRO - Mais Resultados Online</p>
<p style="margin:5px 0 0 0;">Gabriel Fernandes da Silva | CNPJ: 54.840.738/0001-96</p>
</td>
</tr>
</table>
</body>
</html>`;

    // Build expiration section
    let expirationSection = '';
    if (accessType && accessType !== 'lifetime' && expirationDate) {
      const expDate = new Date(expirationDate);
      const formattedDate = expDate.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
      const planType = accessType === 'annual' ? 'Anual' : 'Mensal';
      expirationSection = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:15px 0;"><tr><td style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:15px;text-align:center;"><span style="color:#856404;font-weight:bold;">🎁 Plano ${planType}</span> - Acesso até <strong style="color:#856404;">${formattedDate}</strong></td></tr></table>`;
    } else if (accessType === 'lifetime') {
      expirationSection = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:15px 0;"><tr><td style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:15px;text-align:center;"><span style="color:#155724;font-weight:bold;">♾️ Acesso Vitalício</span> - Sem data de expiração!</td></tr></table>`;
    }

    const finalHtml = htmlContent.replace('{EXPIRATION_SECTION}', expirationSection);

    await client.send({
      from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: customerEmail,
      subject: `MRO - Acesso Liberado ao ${serviceName}!`,
      content: "Seu acesso foi liberado! Veja os detalhes no email HTML.",
      html: finalHtml,
    });

    await client.close();
    logStep("Email sent successfully", { to: customerEmail });
    return true;
  } catch (error: any) {
    logStep("Error sending email", { error: error?.message || String(error) });
    return false;
  }
}

// Create user in WhatsApp API (ZAPMRO)
async function createWhatsAppUser(username: string, password: string, accessType: string): Promise<boolean> {
  try {
    // API pública do ZAPMRO com autenticação Bearer
    const apiUrl = `${WHATSAPP_API_URL}/public/api/users`;
    
    logStep("Creating WhatsApp user", { username, accessType, apiUrl });

    const createResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secreta123',
      },
      body: JSON.stringify({
        username,
        password,
        access_type: accessType, // 'lifetime' ou 'annual'
      }),
    });

    const responseText = await createResponse.text();
    logStep("WhatsApp API response", { status: createResponse.status, body: responseText });

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      logStep("WhatsApp API returned non-JSON response", { responseText });
      return createResponse.ok;
    }

    if (!createResponse.ok) {
      logStep("WhatsApp user creation failed", { status: createResponse.status, result });
      return false;
    }

    logStep("WhatsApp user created successfully", result);
    return true;
  } catch (error: any) {
    logStep("Error creating WhatsApp user", { error: error?.message || String(error) });
    return false;
  }
}

// Create user in Instagram API
async function createInstagramUser(username: string, password: string, daysAccess: number): Promise<boolean> {
  try {
    // First enable user
    const enableResponse = await fetch(`${INSTAGRAM_API_URL}/habilitar-usuario/${username}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, senha: password }),
    });

    if (!enableResponse.ok) {
      logStep("Instagram enable user failed");
      // Continue anyway, might be already enabled
    }

    // Add user
    const addResponse = await fetch(`${INSTAGRAM_API_URL}/adicionar-usuario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        time: daysAccess,
        igUsers: '',
      }),
    });

    const result = await addResponse.json();
    logStep("Instagram user creation result", result);
    return addResponse.ok;
  } catch (error: any) {
    logStep("Error creating Instagram user", { error: error?.message || String(error) });
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

    const { action, ...data } = await req.json();
    logStep("Action received", { action });

    switch (action) {
      case "create_access": {
        const { customerEmail, customerName, username, password, serviceType, accessType, daysAccess, notes, createInApi = true } = data;

        // Create user in external API only if createInApi is true
        let apiCreated = false;
        if (createInApi) {
          if (serviceType === 'whatsapp') {
            apiCreated = await createWhatsAppUser(username, password, accessType);
          } else if (serviceType === 'instagram') {
            apiCreated = await createInstagramUser(username, password, daysAccess || 365);
          }
        } else {
          logStep("Skipping API creation - user requested local only");
        }

        // Calculate expiration date
        let expirationDate: string | null = null;
        if (accessType !== 'lifetime') {
          const days = daysAccess || (accessType === 'annual' ? 365 : 30);
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + days);
          expirationDate = expDate.toISOString();
        }

        // Generate tracking ID
        const trackingId = `track_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Send email
        const emailSent = await sendAccessEmail(customerEmail, customerName, username, password, serviceType, accessType, expirationDate);

        // Save to database
        const { data: accessRecord, error } = await supabase
          .from('created_accesses')
          .insert({
            customer_email: customerEmail,
            customer_name: customerName,
            username,
            password,
            service_type: serviceType,
            access_type: accessType,
            days_access: daysAccess || 365,
            expiration_date: expirationDate,
            tracking_id: trackingId,
            api_created: apiCreated,
            email_sent: emailSent,
            email_sent_at: emailSent ? new Date().toISOString() : null,
            notes,
          })
          .select()
          .single();

        if (error) {
          logStep("Error saving access record", { error: error.message });
          throw new Error(error.message);
        }

        logStep("Access created successfully", { id: accessRecord.id });
        return new Response(JSON.stringify({
          success: true,
          accessRecord,
          apiCreated,
          emailSent,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_accesses": {
        const { data: accesses, error } = await supabase
          .from('created_accesses')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);

        return new Response(JSON.stringify({ success: true, accesses }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "resend_email": {
        const { id } = data;

        const { data: access, error: fetchError } = await supabase
          .from('created_accesses')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError || !access) throw new Error('Access record not found');

        const emailSent = await sendAccessEmail(
          access.customer_email,
          access.customer_name,
          access.username,
          access.password,
          access.service_type,
          access.access_type,
          access.expiration_date
        );

        if (emailSent) {
          await supabase
            .from('created_accesses')
            .update({ email_sent: true, email_sent_at: new Date().toISOString() })
            .eq('id', id);
        }

        return new Response(JSON.stringify({ success: emailSent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_access": {
        const { id, updates } = data;

        const { error } = await supabase
          .from('created_accesses')
          .update(updates)
          .eq('id', id);

        if (error) throw new Error(error.message);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_access": {
        const { id } = data;

        const { error } = await supabase
          .from('created_accesses')
          .delete()
          .eq('id', id);

        if (error) throw new Error(error.message);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "test_whatsapp_api": {
        try {
          const response = await fetch(`${WHATSAPP_API_URL}/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          
          const success = response.ok;
          logStep("WhatsApp API test", { status: response.status, success });
          
          return new Response(JSON.stringify({ 
            success, 
            message: success ? 'API WhatsApp respondendo!' : `Erro: Status ${response.status}` 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          logStep("WhatsApp API test error", { error: error?.message });
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Erro de conexão: ${error?.message || 'Desconhecido'}` 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "test_instagram_api": {
        try {
          const response = await fetch(`${INSTAGRAM_API_URL}/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          
          const success = response.ok;
          logStep("Instagram API test", { status: response.status, success });
          
          return new Response(JSON.stringify({ 
            success, 
            message: success ? 'API Instagram respondendo!' : `Erro: Status ${response.status}` 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          logStep("Instagram API test error", { error: error?.message });
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Erro de conexão: ${error?.message || 'Desconhecido'}` 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "test_email": {
        const { email } = data;
        
        if (!email) {
          return new Response(JSON.stringify({ success: false, message: 'Email não informado' }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        try {
          const smtpPassword = Deno.env.get("SMTP_PASSWORD");
          if (!smtpPassword) {
            return new Response(JSON.stringify({ success: false, message: 'SMTP não configurado' }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
          
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
            from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
            to: email,
            subject: "🧪 Email de Teste - MRO Admin",
            content: "Este é um email de teste do sistema MRO Admin.",
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; background: #1a1a1a; color: #fff;">
                <h2 style="color: #FFD700;">🧪 Email de Teste</h2>
                <p>Este é um email de teste do sistema <strong>MRO Admin</strong>.</p>
                <p>Se você recebeu este email, o sistema de envio está funcionando corretamente!</p>
                <hr style="border-color: #333;">
                <p style="color: #888; font-size: 12px;">MRO - Mais Resultados Online</p>
              </div>
            `,
          });

          await client.close();
          logStep("Test email sent successfully", { to: email });

          return new Response(JSON.stringify({ success: true, message: `Email enviado para ${email}` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          logStep("Test email error", { error: error?.message });
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Erro ao enviar: ${error?.message || 'Desconhecido'}` 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "get_settings": {
        try {
          const { data, error } = await supabase.storage
            .from('user-data')
            .download('admin/user-access-settings.json');

          if (error || !data) {
            return new Response(JSON.stringify({ success: true, settings: null }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const text = await data.text();
          const settings = JSON.parse(text);
          
          return new Response(JSON.stringify({ success: true, settings }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          return new Response(JSON.stringify({ success: true, settings: null }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "save_settings": {
        const { settings } = data;
        
        try {
          const jsonBlob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
          
          const { error } = await supabase.storage
            .from('user-data')
            .upload('admin/user-access-settings.json', jsonBlob, {
              upsert: true,
              contentType: 'application/json',
            });

          if (error) throw error;

          logStep("Settings saved successfully");
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          logStep("Error saving settings", { error: error?.message });
          return new Response(JSON.stringify({ success: false, error: error?.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "send_mass_email": {
        const { emails, subject, message } = data;
        
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
          return new Response(JSON.stringify({ 
            success: false, 
            message: 'Nenhum email informado' 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const smtpPassword = Deno.env.get("SMTP_PASSWORD");
        if (!smtpPassword) {
          return new Response(JSON.stringify({ 
            success: false, 
            message: 'SMTP não configurado' 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const results: Array<{ email: string; success: boolean }> = [];
        let sent = 0;
        let failed = 0;

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

        const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); padding: 30px; text-align: center; }
    .header h1 { color: #000; margin: 0; font-size: 24px; }
    .content { padding: 30px; background: #f9f9f9; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #1a1a1a; }
    .footer p { color: #888; margin: 5px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📢 MRO - Mais Resultados Online</h1>
  </div>
  <div class="content">
    ${message}
  </div>
  <div class="footer">
    <p>MRO - Mais Resultados Online</p>
    <p>Gabriel Fernandes da Silva</p>
    <p>CNPJ: 54.840.738/0001-96</p>
  </div>
</body>
</html>
        `;

        for (const email of emails) {
          try {
            await client.send({
              from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
              to: email,
              subject: subject || '📢 Novidades do MRO!',
              content: message.replace(/<[^>]*>/g, ''), // Plain text version
              html: htmlTemplate,
            });
            results.push({ email, success: true });
            sent++;
            logStep("Mass email sent", { to: email });
          } catch (error: any) {
            results.push({ email, success: false });
            failed++;
            logStep("Mass email failed", { to: email, error: error?.message });
          }
        }

        await client.close();

        return new Response(JSON.stringify({
          success: true,
          total: emails.length,
          sent,
          failed,
          results,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    logStep("ERROR", { message: errorMsg });
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
