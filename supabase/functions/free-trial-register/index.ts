import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FREE-TRIAL-REGISTER] ${step}${detailsStr}`);
};

// SquareCloud API URL
const SQUARE_API_URL = "https://dashboardmroinstagramvini-online.squareweb.app";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fullName, email, whatsapp, instagramUsername } = await req.json();
    
    log("Request received", { fullName, email, whatsapp, instagramUsername });

    // Validate inputs
    if (!fullName || !email || !whatsapp || !instagramUsername) {
      return new Response(
        JSON.stringify({ success: false, message: 'Todos os campos são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Normalize Instagram username (remove @ and lowercase)
    const normalizedIG = instagramUsername.toLowerCase().replace(/^@/, '').trim();

    // Validate Instagram format
    if (normalizedIG.length < 1 || !/^[a-zA-Z0-9._]+$/.test(normalizedIG)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Nome de Instagram inválido. Use apenas letras, números, pontos e underlines.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if this Instagram was already used for trial
    const { data: existingTrial } = await supabase
      .from('free_trial_registrations')
      .select('*')
      .eq('instagram_username', normalizedIG)
      .single();

    if (existingTrial) {
      log("Instagram already used", { instagram: normalizedIG, testedAt: existingTrial.registered_at });
      return new Response(
        JSON.stringify({ 
          success: false, 
          alreadyTested: true,
          testedAt: existingTrial.registered_at,
          message: `Este Instagram já foi utilizado para teste em ${new Date(existingTrial.registered_at).toLocaleString('pt-BR')}. Adquira um plano para continuar!`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get trial settings
    const { data: settings, error: settingsError } = await supabase
      .from('free_trial_settings')
      .select('*')
      .limit(1)
      .single();

    if (settingsError || !settings) {
      log("Settings not found", { error: settingsError });
      return new Response(
        JSON.stringify({ success: false, message: 'Configurações do teste não encontradas. Configure o admin primeiro.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!settings.is_active) {
      return new Response(
        JSON.stringify({ success: false, message: 'Teste grátis está temporariamente desabilitado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mroUsername = settings.mro_master_username;
    const mroPassword = settings.mro_master_password;
    const trialHours = settings.trial_duration_hours || 24;

    if (!mroUsername || !mroPassword) {
      log("MRO credentials not configured");
      return new Response(
        JSON.stringify({ success: false, message: 'Credenciais MRO não configuradas. Entre em contato com o suporte.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Generate username and password for this trial
    const generatedUsername = mroUsername;
    const generatedPassword = mroPassword;

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + trialHours);

    // Add Instagram to MRO master account via SquareCloud API
    log("Adding Instagram to MRO account", { mroUsername, instagram: normalizedIG });
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const addIgResponse = await fetch(`${SQUARE_API_URL}/adicionar-instagram`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          userName: mroUsername,
          igInstagram: normalizedIG
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      log("API Response Status", { status: addIgResponse.status, statusText: addIgResponse.statusText });

      const responseText = await addIgResponse.text();
      log("API Response Body", { body: responseText });

      let addIgResult;
      try {
        addIgResult = JSON.parse(responseText);
      } catch (parseError) {
        log("Failed to parse API response", { error: parseError, responseText });
        return new Response(
          JSON.stringify({ success: false, message: 'Resposta inválida do servidor de automação. Tente novamente.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      if (!addIgResult.success) {
        log("API returned error", addIgResult);
        return new Response(
          JSON.stringify({ success: false, message: addIgResult.message || 'Erro ao adicionar Instagram na plataforma' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (apiError: any) {
      log("API Error", { 
        error: apiError.message || apiError,
        name: apiError.name,
        cause: apiError.cause
      });
      
      const errorMessage = apiError.name === 'AbortError' 
        ? 'Tempo limite excedido. O servidor de automação está demorando para responder.'
        : 'Erro ao conectar com o servidor de automação. Verifique se está online.';
      
      return new Response(
        JSON.stringify({ success: false, message: errorMessage }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Save registration to database
    const { error: insertError } = await supabase
      .from('free_trial_registrations')
      .insert({
        full_name: fullName,
        email: email.toLowerCase(),
        whatsapp,
        instagram_username: normalizedIG,
        generated_username: generatedUsername,
        generated_password: generatedPassword,
        mro_master_user: mroUsername,
        expires_at: expiresAt.toISOString(),
        email_sent: false,
        instagram_removed: false
      });

    if (insertError) {
      log("Insert error", { error: insertError });
      // Try to remove Instagram from MRO since registration failed
      try {
        await fetch(`${SQUARE_API_URL}/remover-instagram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: mroUsername,
            instagram: normalizedIG
          })
        });
      } catch (e) {
        log("Failed to rollback Instagram", { error: e });
      }
      
      return new Response(
        JSON.stringify({ success: false, message: 'Erro ao salvar registro. Tente novamente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Send welcome email
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (smtpPassword) {
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

        const downloadLink = settings.download_link || '#';
        const groupLink = settings.group_link || '#';
        const expiresAtFormatted = expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const accessAreaLink = `https://maisresultadosonline.com.br/testegratis/usuario`;

        const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
<tr>
<td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;">
<div style="background:#000;color:#fff;display:inline-block;padding:10px 25px;border-radius:8px;font-size:32px;font-weight:bold;letter-spacing:2px;margin-bottom:10px;">MRO</div>
<h1 style="color:#fff;margin:15px 0 0 0;font-size:24px;">🎉 Teste Liberado!</h1>
</td>
</tr>
<tr>
<td style="padding:30px;background:#ffffff;">

<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:0 0 25px 0;border-radius:0 8px 8px 0;">
<p style="margin:0;color:#856404;font-size:15px;">
<strong>⚠️ IMPORTANTE: Você tem 24 horas para testar!</strong><br>
Seu teste expira em: <strong>${expiresAtFormatted}</strong><br>
Após esse período, você não poderá testar novamente com este Instagram.
</p>
</div>

<p style="margin:0 0 20px 0;font-size:16px;">Olá <strong>${fullName}</strong>!</p>

<p style="margin:0 0 15px 0;font-size:16px;">Seu teste grátis de 24 horas do <strong>MRO</strong> foi liberado! 🚀</p>

<p style="margin:0 0 15px 0;font-size:16px;">Para acessar sua área de teste e receber suas credenciais, clique no botão abaixo:</p>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border:2px solid #667eea;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;text-align:center;">
<h3 style="color:#333;margin:0 0 10px 0;font-size:16px;">📱 Acesse com seu Instagram cadastrado:</h3>
<p style="font-size:24px;color:#E1306C;font-family:monospace;font-weight:bold;margin:0;">@${normalizedIG}</p>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:25px 0;">
<tr>
<td style="text-align:center;">
<a href="${accessAreaLink}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-decoration:none;padding:18px 50px;border-radius:10px;font-weight:bold;font-size:18px;box-shadow:0 4px 15px rgba(102,126,234,0.4);">🔐 Acessar Minha Área de Teste</a>
</td>
</tr>
</table>

<p style="text-align:center;color:#666;font-size:14px;margin:20px 0;">
Na sua área de teste você receberá:<br>
✅ Suas credenciais de acesso<br>
✅ Link para download do sistema<br>
✅ Vídeos tutoriais de instalação e uso<br>
✅ Acesso ao grupo de suporte
</p>

<div style="background:#ffe6e6;border-left:4px solid #ff4444;padding:15px;margin:25px 0;border-radius:0 8px 8px 0;">
<p style="margin:0;color:#c00;font-size:14px;">
<strong>🔴 Lembre-se:</strong> Após testar uma vez, você não conseguirá testar novamente com este Instagram. 
Valorize suas 24 horas de teste! Após esse período, adquira um de nossos planos.
</p>
</div>

</td>
</tr>
<tr>
<td style="background:#1a1a1a;padding:20px;text-align:center;">
<p style="color:#667eea;margin:0 0 10px 0;font-weight:bold;">Bom teste! 💛</p>
<p style="color:#888;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
</td>
</tr>
</table>
</body>
</html>`;

        await client.send({
          from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
          to: email,
          subject: "🎉 Seu Teste Grátis de 24h foi Liberado! - MRO",
          html: htmlContent,
        });

        await client.close();

        // Update email_sent status
        await supabase
          .from('free_trial_registrations')
          .update({ email_sent: true })
          .eq('instagram_username', normalizedIG);

        log("Email sent successfully", { email });
      } catch (emailError) {
        log("Email error", { error: emailError });
        // Continue even if email fails
      }
    }

    log("Registration successful", { instagram: normalizedIG, expiresAt: expiresAt.toISOString() });

    return new Response(
      JSON.stringify({ 
        success: true, 
        username: generatedUsername,
        password: generatedPassword,
        expiresAt: expiresAt.toISOString(),
        downloadLink: settings.download_link || null,
        groupLink: settings.group_link || null,
        welcomeVideoUrl: settings.welcome_video_url || null,
        installationVideoUrl: settings.installation_video_url || null,
        usageVideoUrl: settings.usage_video_url || null,
        message: 'Teste liberado com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    log('Error', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response(
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
