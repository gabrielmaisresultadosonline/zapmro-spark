import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-WELCOME-EMAIL] ${step}${detailsStr}`);
};

const DEFAULT_WHATSAPP_GROUP = 'https://chat.whatsapp.com/JdEHa4jeLSUKTQFCNp7YXi';
const SUPPORT_WHATSAPP = 'https://maisresultadosonline.com.br/whatsapp';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, username, password, daysRemaining } = await req.json();
    
    logStep("Request received", { email, username, daysRemaining });

    if (!email || !username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email, username and password are required' }),
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let whatsappGroupLink = DEFAULT_WHATSAPP_GROUP;
    try {
      const { data, error } = await supabase.storage
        .from('user-data')
        .download('admin/user-access-settings.json');

      if (!error && data) {
        const text = await data.text();
        const settings = JSON.parse(text);
        if (settings.whatsappGroupLink) {
          whatsappGroupLink = settings.whatsappGroupLink;
          logStep("Using admin WhatsApp group link", { link: whatsappGroupLink });
        }
      }
    } catch (e) {
      logStep("Could not load admin settings, using default WhatsApp link");
    }

    let daysDisplay = '';
    let daysStyle = '';
    if (daysRemaining && daysRemaining > 365) {
      daysDisplay = '♾️ Acesso Vitalício';
      daysStyle = 'background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);color:#000;';
    } else if (daysRemaining && daysRemaining > 0) {
      daysDisplay = `${daysRemaining} dias de acesso`;
      daysStyle = 'background:#f8f9fa;color:#333;';
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

    const memberAreaUrl = 'https://maisresultadosonline.com.br/areademembros';

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
<h1 style="color:#000;margin:15px 0 0 0;font-size:24px;">🎉 Reconhecemos seu Primeiro Acesso!</h1>
</td>
</tr>
<tr>
<td style="padding:30px;background:#ffffff;">

<div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:20px;border-radius:10px;margin-bottom:25px;text-align:center;">
<p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">✨ Parabéns! Você está no caminho certo!</p>
</div>

<p style="margin:0 0 20px 0;font-size:16px;">Olá!</p>
<p style="margin:0 0 15px 0;font-size:16px;">Já reconheci seu <strong>primeiro acesso</strong> à nossa ferramenta <strong>MRO</strong>! 🚀</p>
<p style="margin:0 0 15px 0;font-size:16px;">A partir de agora, você vai:</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="padding:8px 0;"><span style="display:inline-block;background:#FFD700;color:#000;padding:3px 10px;border-radius:15px;font-size:14px;margin-right:8px;">📈</span><span style="color:#333;">Aumentar suas <strong>visualizações</strong></span></td></tr>
<tr><td style="padding:8px 0;"><span style="display:inline-block;background:#FFD700;color:#000;padding:3px 10px;border-radius:15px;font-size:14px;margin-right:8px;">💬</span><span style="color:#333;">Melhorar seu <strong>engajamento</strong></span></td></tr>
<tr><td style="padding:8px 0;"><span style="display:inline-block;background:#FFD700;color:#000;padding:3px 10px;border-radius:15px;font-size:14px;margin-right:8px;">👥</span><span style="color:#333;">Conquistar mais <strong>seguidores</strong></span></td></tr>
<tr><td style="padding:8px 0;"><span style="display:inline-block;background:#FFD700;color:#000;padding:3px 10px;border-radius:15px;font-size:14px;margin-right:8px;">🎯</span><span style="color:#333;">E <strong>muito mais!</strong></span></td></tr>
</table>

<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;">
<p style="margin:0;color:#856404;font-size:15px;"><strong>💛 A MRO não é só uma ferramenta, é uma família de apoio!</strong><br>Você receberá sempre novidades em primeira mão dentro da nossa área.</p>
</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #FFD700;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<h3 style="color:#333;margin:0 0 15px 0;font-size:16px;">📋 Seus Dados de Acesso:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:12px;background:#f8f9fa;border-radius:5px;margin-bottom:10px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td><span style="font-size:12px;color:#666;display:block;">Usuário:</span><span style="font-size:18px;color:#000;font-family:monospace;font-weight:bold;">${username}</span></td>
<td width="40" style="text-align:right;vertical-align:middle;"><span style="font-size:18px;" title="Copie o usuário">📋</span></td>
</tr>
</table>
</td>
</tr>
<tr><td style="height:10px;"></td></tr>
<tr>
<td style="padding:12px;background:#f8f9fa;border-radius:5px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td><span style="font-size:12px;color:#666;display:block;">Senha:</span><span style="font-size:18px;color:#000;font-family:monospace;font-weight:bold;">${password}</span></td>
<td width="40" style="text-align:right;vertical-align:middle;"><span style="font-size:18px;" title="Copie a senha">📋</span></td>
</tr>
</table>
</td>
</tr>
${daysDisplay ? `<tr><td style="height:10px;"></td></tr><tr><td style="padding:12px;${daysStyle}border-radius:5px;text-align:center;"><span style="font-size:14px;font-weight:bold;">⏱️ ${daysDisplay}</span></td></tr>` : ''}
</table>
</td>
</tr>
</table>

<div style="background:#e8f5e9;border:1px solid #4caf50;padding:15px;border-radius:8px;margin:20px 0;">
<p style="margin:0;color:#2e7d32;font-size:14px;"><strong>✅ Primeiro passo concluído!</strong><br>Seu cadastro e email já estão salvos. A partir de agora, não precisará fazer isso novamente — <strong>vamos manter contato com você por este email</strong> além do nosso WhatsApp de suporte!</p>
</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<h3 style="color:#333;margin:0 0 15px 0;font-size:16px;">📝 Próximos Passos:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:10px 0;border-bottom:1px solid #e0e0e0;"><span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">1</span><span style="color:#333;">Acesse nossa <strong>Área de Membros</strong></span></td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #e0e0e0;"><span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">2</span><span style="color:#333;">Assista os <strong>vídeos tutoriais</strong></span></td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #e0e0e0;"><span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">3</span><span style="color:#333;">Entre no <strong>Grupo do WhatsApp</strong> para suporte</span></td></tr>
<tr><td style="padding:10px 0;"><span style="display:inline-block;background:#25D366;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">✓</span><span style="color:#333;font-weight:bold;">Pronto! Utilize à vontade!</span></td></tr>
</table>
</td>
</tr>
</table>

<!-- CTA Buttons -->
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="text-align:center;padding:20px 0 10px 0;">
<a href="${memberAreaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);color:#000;text-decoration:none;padding:15px 40px;border-radius:8px;font-weight:bold;font-size:16px;">🚀 Acessar Área de Membros</a>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0;">
<tr>
<td style="text-align:center;padding:12px;background:#25D366;border-radius:8px;">
<a href="${SUPPORT_WHATSAPP}" style="color:#fff;text-decoration:none;font-weight:bold;font-size:16px;">📱 Falar no WhatsApp com Suporte</a>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 20px 0;">
<tr>
<td style="text-align:center;padding:12px;background:#128C7E;border-radius:8px;">
<a href="${whatsappGroupLink}" style="color:#fff;text-decoration:none;font-weight:bold;font-size:14px;">👥 Entrar no Grupo do WhatsApp</a>
</td>
</tr>
</table>

</td>
</tr>
<tr>
<td style="background:#1a1a1a;padding:20px;text-align:center;">
<p style="color:#FFD700;margin:0 0 10px 0;font-weight:bold;">Bem-vindo à família MRO! 💛</p>
<p style="color:#888;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
<p style="color:#666;margin:10px 0 0 0;font-size:11px;">Este email foi enviado porque você cadastrou seu email em nossa plataforma.</p>
</td>
</tr>
</table>
</body>
</html>`;

    await client.send({
      from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: email,
      subject: "🎉 Reconhecemos seu Primeiro Acesso à MRO!",
      html: htmlContent,
    });

    await client.close();

    await supabase.from('user_sessions').update({
      email: email,
      updated_at: new Date().toISOString()
    }).eq('squarecloud_username', username.toLowerCase());

    logStep("Welcome email sent successfully", { email, username });

    return new Response(
      JSON.stringify({ success: true, message: 'Welcome email sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logStep('Error sending welcome email', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
