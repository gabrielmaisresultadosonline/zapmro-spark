import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ZAPMRO-USER-STORAGE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, username, email, password, daysRemaining } = await req.json();
    
    logStep("Request received", { action, username, hasEmail: !!email });

    if (!username) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const normalizedUsername = username.toLowerCase();

    // SAVE - Create or update user data
    if (action === 'save') {
      logStep(`Saving user data`, { username: normalizedUsername, hasEmail: !!email });

      // Check if user exists
      const { data: existing } = await supabase
        .from('zapmro_users')
        .select('*')
        .eq('username', normalizedUsername)
        .maybeSingle();

      let result;
      if (existing) {
        // Update existing - only update email if not locked
        const updateData: any = {
          last_access: new Date().toISOString()
        };
        
        if (email && !existing.email_locked) {
          updateData.email = email;
          updateData.email_locked = true;
        }
        
        if (daysRemaining !== undefined) {
          updateData.days_remaining = daysRemaining;
        }

        const { data, error } = await supabase
          .from('zapmro_users')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();
        result = { data, error };
      } else {
        // Insert new user
        const { data, error } = await supabase
          .from('zapmro_users')
          .insert({
            username: normalizedUsername,
            email: email || null,
            email_locked: !!email,
            days_remaining: daysRemaining || 365
          })
          .select()
          .single();
        result = { data, error };
      }

      if (result.error) {
        logStep('Error saving user data', { error: result.error.message });
        return new Response(
          JSON.stringify({ success: false, error: result.error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      logStep(`Saved data for ${normalizedUsername} successfully`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: result.data,
          isNewEmail: !existing?.email && !!email
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // LOAD - Get user data
    if (action === 'load') {
      const { data, error } = await supabase
        .from('zapmro_users')
        .select('*')
        .eq('username', normalizedUsername)
        .maybeSingle();

      if (error) {
        logStep('Error loading user data', { error: error.message });
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Update last access
      if (data) {
        await supabase
          .from('zapmro_users')
          .update({ last_access: new Date().toISOString() })
          .eq('id', data.id);
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SEND_WELCOME_EMAIL - Send welcome email for ZAPMRO
    if (action === 'send_welcome_email') {
      if (!email || !password) {
        return new Response(
          JSON.stringify({ success: false, error: 'Email and password required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const smtpPassword = Deno.env.get("SMTP_PASSWORD");
      if (!smtpPassword) {
        logStep("SMTP password not configured");
        return new Response(
          JSON.stringify({ success: false, error: 'SMTP not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
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
<td style="background:linear-gradient(135deg,#25D366 0%,#128C7E 100%);padding:30px;text-align:center;">
<div style="background:#000;color:#25D366;display:inline-block;padding:10px 25px;border-radius:8px;font-size:28px;font-weight:bold;letter-spacing:2px;margin-bottom:10px;">ZAPMRO</div>
<h1 style="color:#fff;margin:15px 0 0 0;font-size:24px;">🎉 Bem-vindo à Área VIP!</h1>
</td>
</tr>
<tr>
<td style="padding:30px;background:#ffffff;">
<p style="margin:0 0 20px 0;font-size:16px;">Olá! Seja muito bem-vindo à nossa <strong>área de membros ZAPMRO</strong>!</p>
<p style="margin:0 0 20px 0;">Seu acesso está liberado e pronto para uso!</p>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #25D366;border-radius:10px;margin:20px 0;">
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

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<h3 style="color:#333;margin:0 0 15px 0;font-size:16px;">📝 Passo a Passo:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#25D366;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">1</span>
<span style="color:#333;">Acesse nossa página oficial clicando no botão abaixo</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#25D366;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">2</span>
<span style="color:#333;">Clique no botão <strong>"Área de Membros"</strong></span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#25D366;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">3</span>
<span style="color:#333;">Insira seu <strong>usuário</strong> e <strong>senha</strong> informados acima</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#128C7E;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">✓</span>
<span style="color:#333;font-weight:bold;">Pronto! Tudo certo!</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;">
<span style="display:inline-block;background:#000;color:#25D366;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">🎬</span>
<span style="color:#333;font-weight:bold;">Agora acesse os vídeos e utilize à vontade!</span>
</td>
</tr>
</table>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="text-align:center;padding:20px 0;">
<a href="${memberAreaUrl}" style="display:inline-block;background:linear-gradient(135deg,#25D366 0%,#128C7E 100%);color:#fff;text-decoration:none;padding:15px 40px;border-radius:8px;font-weight:bold;font-size:16px;">🚀 Acessar Área de Membros</a>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
<tr>
<td style="text-align:center;padding:15px;background:#25D366;border-radius:8px;">
<a href="${whatsappGroupLink}" style="color:#fff;text-decoration:none;font-weight:bold;font-size:14px;">📱 Entrar no Grupo do WhatsApp</a>
</td>
</tr>
</table>

</td>
</tr>
<tr>
<td style="background:#1a1a1a;padding:20px;text-align:center;">
<p style="color:#888;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
<p style="color:#666;margin:10px 0 0 0;font-size:11px;">Este email foi enviado porque você cadastrou seu email na plataforma ZAPMRO.</p>
</td>
</tr>
</table>
</body>
</html>`;

      try {
        await client.send({
          from: "ZAPMRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
          to: email,
          subject: "🎉 Bem-vindo à Área VIP ZAPMRO!",
          html: htmlContent,
        });

        await client.close();
        logStep("Welcome email sent successfully", { email, username });

        return new Response(
          JSON.stringify({ success: true, message: 'Welcome email sent' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (emailError) {
        logStep('Error sending email', { error: emailError instanceof Error ? emailError.message : 'Unknown' });
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to send email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    // GET_ALL_USERS - Admin action to get all ZAPMRO users
    if (action === 'get_all_users') {
      const { data, error } = await supabase
        .from('zapmro_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logStep('Error fetching users', { error: error.message });
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      logStep(`Found ${data?.length || 0} ZAPMRO users`);
      return new Response(
        JSON.stringify({ success: true, users: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    logStep('Error', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
