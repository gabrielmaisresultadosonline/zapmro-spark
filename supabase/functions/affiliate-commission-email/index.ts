import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AFFILIATE-COMMISSION-EMAIL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      type, // 'commission' | 'summary' | 'welcome' | 'simple_summary'
      affiliateEmail, 
      affiliateName,
      affiliateId,
      customerEmail,
      customerName,
      commission,
      // For summary
      totalSales,
      totalCommission,
      salesList,
      promoStartTime,
      promoEndTime,
      // For attempts list in summary
      attemptsList,
      multipleAttemptsList,
      // For welcome
      promoStartDate,
      promoEndDate,
      affiliateLink,
      // For lifetime affiliates
      isLifetime,
      // WhatsApp number (optional, will fallback to storage)
      whatsappNumber,
      // Timestamp do resumo
      summaryTimestamp,
      // For simple_summary
      notPaidAttempts,
      resumoLink
    } = await req.json();
    
    logStep("Request received", { type, affiliateEmail, affiliateName, affiliateId });

    // Se não temos o email do afiliado mas temos o ID, tentar buscar do storage
    let finalAffiliateEmail = affiliateEmail;
    let finalAffiliateName = affiliateName;
    let finalIsLifetime = isLifetime;
    let finalWhatsApp = whatsappNumber || "";
    
    // Buscar dados do storage (afiliado e configurações)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Buscar dados do afiliado se necessário
      if ((!finalAffiliateEmail || finalIsLifetime === undefined) && affiliateId) {
        try {
          const { data, error } = await supabase.storage
            .from('user-data')
            .download('admin/affiliates.json');
          
          if (!error && data) {
            const text = await data.text();
            const affiliates = JSON.parse(text);
            const affiliate = affiliates.find((a: any) => a.id === affiliateId);
            
            if (affiliate) {
              finalAffiliateEmail = finalAffiliateEmail || affiliate.email;
              finalAffiliateName = finalAffiliateName || affiliate.name;
              finalIsLifetime = finalIsLifetime !== undefined ? finalIsLifetime : (affiliate.isLifetime || false);
              logStep("Found affiliate from storage", { affiliateId, email: finalAffiliateEmail, isLifetime: finalIsLifetime });
            }
          }
        } catch (e) {
          logStep("Could not load affiliate from storage", { error: String(e) });
        }
      }
      
      // Buscar configurações globais (WhatsApp)
      if (!finalWhatsApp) {
        try {
          const { data: settingsData, error: settingsError } = await supabase.storage
            .from('user-data')
            .download('admin/affiliate-settings.json');
          
          if (!settingsError && settingsData) {
            const settingsText = await settingsData.text();
            const settings = JSON.parse(settingsText);
            finalWhatsApp = settings.whatsapp || "5511999999999";
            logStep("Loaded WhatsApp from settings", { whatsapp: finalWhatsApp });
          }
        } catch (e) {
          logStep("Could not load settings, using default WhatsApp", { error: String(e) });
          finalWhatsApp = "5511999999999";
        }
      }
    }

    if (!finalAffiliateEmail) {
      logStep("No affiliate email found, skipping");
      return new Response(
        JSON.stringify({ success: false, error: 'Affiliate email not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!finalAffiliateName) {
      finalAffiliateName = affiliateId || "Afiliado";
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

    let subject = '';
    let htmlContent = '';

    if (type === 'welcome') {
      // Email de boas-vindas para novo afiliado
      subject = `🎉 Bem-vindo à Família MRO, ${finalAffiliateName}!`;
      
      // Formatar datas (só se não for vitalício)
      let promoDateText = '';
      let paymentInfo = '';
      
      if (isLifetime) {
        // Afiliado vitalício - recebe na hora
        paymentInfo = `<div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);border:2px solid #047857;padding:25px;margin:25px 0;border-radius:15px;text-align:center;">
<p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">⚡ COMISSÃO NA HORA!</p>
<p style="margin:15px 0 0 0;color:#fff;font-size:15px;line-height:1.8;">
Você é um afiliado <strong>VITALÍCIO</strong>!<br>
Suas comissões serão repassadas <strong>imediatamente</strong> quando cada venda for aprovada!
</p>
</div>`;
      } else {
        if (promoEndDate && promoEndTime) {
          const endDate = new Date(promoEndDate + 'T' + promoEndTime);
          promoDateText = `dia ${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')} às ${promoEndTime}`;
        } else if (promoEndDate) {
          const endDate = new Date(promoEndDate);
          promoDateText = `dia ${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')}`;
        }
        
        paymentInfo = `<div style="background:#2d2d2d;border-left:5px solid #FFD700;padding:20px 25px;margin:25px 0;border-radius:0 15px 15px 0;">
<p style="margin:0;color:#fff;font-size:15px;line-height:1.8;">
<strong style="color:#FFD700;">📅 As comissões serão passadas ao final da promoção ${promoDateText ? promoDateText : ''}.</strong>
</p>
</div>`;
      }
      
      htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#1a1a1a;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#1a1a1a;">

<!-- Header -->
<tr>
<td style="background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);padding:40px 30px;text-align:center;border-bottom:3px solid #FFD700;">
<div style="background:#000;color:#FFD700;display:inline-block;padding:15px 35px;border-radius:12px;font-size:36px;font-weight:bold;letter-spacing:3px;margin-bottom:15px;border:2px solid #FFD700;">MRO</div>
<h1 style="color:#fff;margin:20px 0 0 0;font-size:32px;">🎉 Bem-vindo(a)!</h1>
${isLifetime ? '<p style="color:#FFD700;margin:15px 0 0 0;font-size:16px;font-weight:bold;">⭐ AFILIADO VITALÍCIO ⭐</p>' : ''}
</td>
</tr>

<!-- Greeting -->
<tr>
<td style="padding:30px;background:#1a1a1a;">

<div style="background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);padding:30px;border-radius:20px;margin-bottom:30px;text-align:center;">
<p style="margin:0;color:#000;font-size:20px;font-weight:bold;">🤝 Estamos felizes em ter você conosco em parceria!</p>
<p style="margin:15px 0 0 0;color:#333;font-size:16px;">Olá, <strong>${finalAffiliateName}</strong>!</p>
</div>

<!-- Commission Info -->
<div style="background:#2d2d2d;border:3px solid #10b981;border-radius:20px;padding:30px;text-align:center;margin-bottom:30px;">
<p style="margin:0;color:#10b981;font-size:16px;font-weight:bold;">💰 Sua Comissão por Venda:</p>
<p style="margin:15px 0;color:#10b981;font-size:56px;font-weight:bold;">R$ 97</p>
<p style="margin:0;color:#9ca3af;font-size:14px;">E pode deixar que o <strong style="color:#fff;">suporte todo é nosso!</strong></p>
</div>

<!-- Payment Info (dynamic based on lifetime or not) -->
${paymentInfo}

<!-- Notifications -->
<div style="background:#2d2d2d;border:2px solid #4b5563;border-radius:15px;padding:25px;margin-bottom:25px;">
<p style="margin:0;color:#fff;font-size:15px;line-height:1.8;">
📧 <strong style="color:#FFD700;">Todas as vendas</strong> feitas pelo seu link serão <strong style="color:#FFD700;">notificadas no seu email</strong> quando aprovadas.
</p>
<p style="margin:15px 0 0 0;color:#9ca3af;font-size:14px;">
Assim contabilizando junto com a gente de forma <strong style="color:#fff;">transparente</strong>.
</p>
</div>

<!-- Potential Earnings -->
<div style="background:#000;border:2px solid #FFD700;border-radius:20px;padding:30px;text-align:center;margin-bottom:25px;">
<p style="margin:0;color:#FFD700;font-size:18px;font-weight:bold;">🚀 Seu faturamento não tem limite!</p>
<p style="margin:20px 0;color:#fff;font-size:16px;">Você pode chegar a mais de</p>
<p style="margin:0;color:#10b981;font-size:48px;font-weight:bold;">R$ 5.000</p>
<p style="margin:10px 0 0 0;color:#9ca3af;font-size:14px;">com apenas <strong style="color:#FFD700;">60 vendas!</strong></p>
</div>

<!-- Support Info -->
<div style="background:#2d2d2d;border:2px solid #4b5563;border-radius:15px;padding:25px;margin-bottom:25px;">
<p style="margin:0;color:#fff;font-size:15px;line-height:1.9;">
<strong style="color:#FFD700;">💼 Suporte Completo:</strong><br><br>
✅ O suporte da ferramenta será feito por <strong>nós</strong>, não precisa se preocupar com seus clientes!<br><br>
✅ Para quem está vendendo, vamos dar <strong>total suporte</strong> aqui também para ter 100% de <strong style="color:#FFD700;">confiança e credibilidade</strong> com ambos.
</p>
</div>

<!-- Affiliate Link -->
${affiliateLink ? `
<div style="background:#2d2d2d;border:2px dashed #10b981;border-radius:15px;padding:25px;text-align:center;margin-bottom:25px;">
<p style="margin:0 0 15px 0;color:#10b981;font-size:14px;font-weight:bold;">🔗 Seu Link de Afiliado:</p>
<div style="background:#000;padding:15px 20px;border-radius:10px;word-break:break-all;">
<a href="${affiliateLink}" style="color:#10b981;font-family:monospace;font-size:14px;text-decoration:none;">${affiliateLink}</a>
</div>
<p style="margin:15px 0 0 0;color:#9ca3af;font-size:12px;">Use sempre este link para suas vendas!</p>
</div>
` : ''}

<!-- Final Message -->
<div style="text-align:center;padding:20px 0;">
<p style="margin:0;color:#fff;font-size:18px;line-height:1.8;">
<strong>MRO agradece mais uma vez a parceria!</strong><br>
Utilize sempre o seu link de compra e <strong style="color:#FFD700;">vamos pra cima! 🔥</strong>
</p>
</div>

<div style="text-align:center;padding:30px 0 10px 0;border-top:2px solid #4b5563;margin-top:20px;">
<p style="margin:0;color:#9ca3af;font-size:16px;">Atenciosamente,</p>
<p style="margin:10px 0 0 0;color:#FFD700;font-size:24px;font-weight:bold;">Gabriel</p>
<p style="margin:5px 0 0 0;color:#6b7280;font-size:14px;">Fundador MRO</p>
</div>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:#000;padding:25px;text-align:center;border-top:3px solid #FFD700;">
<p style="color:#FFD700;margin:0 0 10px 0;font-weight:bold;font-size:16px;">MRO - Programa de Afiliados 💛</p>
<p style="color:#6b7280;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
<p style="color:#4b5563;margin:10px 0 0 0;font-size:11px;">Juntos vamos longe! 🚀</p>
</td>
</tr>
</table>
</body>
</html>`;

    } else if (type === 'commission') {
      // Email de comissão por venda individual
      subject = finalIsLifetime 
        ? `⚡ Comissão APROVADA! Receba agora, ${finalAffiliateName}!`
        : `💰 Temos uma comissão para você, ${finalAffiliateName}!`;
      
      // Instrução de pagamento diferente para vitalício
      const paymentInstruction = finalIsLifetime 
        ? `<div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);border-radius:15px;padding:25px;text-align:center;margin:25px 0;">
<p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">⚡ RECEBA AGORA!</p>
<p style="margin:15px 0;color:#fff;font-size:15px;line-height:1.8;">
Esta venda foi <strong>APROVADA</strong>!<br>
Entre em contato pelo nosso <strong>WhatsApp</strong> e envie seu <strong>PIX</strong> para receber sua comissão imediatamente!
</p>
<a href="https://maisresultadosonline.com.br/whatsapp" style="display:inline-block;background:#000;color:#FFD700;padding:15px 30px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:16px;margin-top:10px;">📱 Chamar no WhatsApp</a>
</div>`
        : `<div style="background:#2d2d2d;border-left:4px solid #FFD700;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;">
<p style="margin:0;color:#fff;font-size:14px;">
<strong style="color:#FFD700;">💡 Continue indicando!</strong><br>
<span style="color:#9ca3af;">Cada venda através do seu link gera comissão. Quanto mais indicações, mais você ganha!</span>
</p>
</div>`;
      
      htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#1a1a1a;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#1a1a1a;">
<tr>
<td style="background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);padding:30px;text-align:center;border-bottom:3px solid #10b981;">
<div style="background:#000;color:#FFD700;display:inline-block;padding:12px 30px;border-radius:10px;font-size:32px;font-weight:bold;letter-spacing:2px;margin-bottom:10px;border:2px solid #FFD700;">MRO</div>
<h1 style="color:#10b981;margin:15px 0 0 0;font-size:28px;">💰 Comissão Confirmada!</h1>
${finalIsLifetime ? '<p style="color:#FFD700;margin:10px 0 0 0;font-size:14px;font-weight:bold;">⭐ AFILIADO VITALÍCIO - RECEBA NA HORA! ⭐</p>' : ''}
</td>
</tr>
<tr>
<td style="padding:30px;background:#1a1a1a;">

<div style="background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);padding:25px;border-radius:15px;margin-bottom:25px;text-align:center;">
<p style="margin:0;color:#000;font-size:16px;font-weight:bold;">🎉 PARABÉNS, ${finalAffiliateName.toUpperCase()}!</p>
<p style="margin:10px 0 0 0;color:#000;font-size:14px;">Você tem uma nova comissão!</p>
</div>

<div style="background:#2d2d2d;border:3px solid #10b981;border-radius:15px;padding:25px;text-align:center;margin-bottom:25px;">
<p style="margin:0;color:#9ca3af;font-size:14px;">Valor da sua comissão:</p>
<p style="margin:10px 0;color:#10b981;font-size:48px;font-weight:bold;">R$ ${commission || '97'},00</p>
<p style="margin:0;color:#10b981;font-size:16px;font-weight:bold;">🚀 Vamos para cima!</p>
</div>

<div style="background:#2d2d2d;border-radius:10px;padding:20px;margin-bottom:25px;">
<h3 style="color:#FFD700;margin:0 0 15px 0;font-size:16px;">📋 Detalhes da Venda:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:10px;background:#1a1a1a;border-radius:5px;margin-bottom:5px;">
<span style="font-size:12px;color:#9ca3af;display:block;">Cliente:</span>
<span style="font-size:16px;color:#fff;font-weight:bold;">${customerName || 'Novo cliente'}</span>
</td>
</tr>
<tr><td style="height:10px;"></td></tr>
<tr>
<td style="padding:10px;background:#1a1a1a;border-radius:5px;">
<span style="font-size:12px;color:#9ca3af;display:block;">Email do cliente:</span>
<span style="font-size:14px;color:#fff;font-family:monospace;">${customerEmail}</span>
</td>
</tr>
</table>
</div>

${paymentInstruction}

<p style="margin:20px 0;font-size:16px;color:#9ca3af;text-align:center;">
Continue assim! Você está no caminho certo! 🔥
</p>

</td>
</tr>
<tr>
<td style="background:#000;padding:20px;text-align:center;border-top:3px solid #FFD700;">
<p style="color:#FFD700;margin:0 0 10px 0;font-weight:bold;">MRO - Programa de Afiliados 💛</p>
<p style="color:#6b7280;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
</td>
</tr>
</table>
</body>
</html>`;

    } else if (type === 'simple_summary') {
      // Email simplificado com link
      const timestamp = summaryTimestamp || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      
      subject = `📊 Seu Resumo de Vendas MRO - ${totalSales} vendas | R$${totalCommission}`;
      
      htmlContent = `Ola ${finalAffiliateName}!

Seu resumo de vendas esta pronto:

- Vendas: ${totalSales}
- Comissao: R$${totalCommission}
- Tentativas a recuperar: ${notPaidAttempts || 0}

Acesse seu resumo completo com todos os detalhes:
${resumoLink}

Senha de acesso: ${affiliateId || 'mro2024'}

Atualizado em ${timestamp}

MRO - Programa de Afiliados`;

    } else if (type === 'summary' || type === 'partial_summary') {
      // Email de resumo (final ou parcial)
      const isPartial = type === 'partial_summary';
      const timestamp = summaryTimestamp || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      
      subject = isPartial 
        ? `📊 Resumo de Vendas e Tentativas - ${finalAffiliateName} (${timestamp})`
        : `📊 Resumo Final das suas Vendas - ${finalAffiliateName}`;
      
      // Build sales table rows
      let salesRows = '';
      if (salesList && salesList.length > 0) {
        salesList.forEach((sale: any, index: number) => {
          salesRows += `
<tr style="border-bottom:1px solid #e5e7eb;">
<td style="padding:12px;font-size:14px;">${index + 1}</td>
<td style="padding:12px;font-size:14px;">${sale.customerEmail}</td>
<td style="padding:12px;font-size:14px;">${sale.customerName || '-'}</td>
<td style="padding:12px;font-size:14px;">${sale.phone || '-'}</td>
<td style="padding:12px;font-size:14px;">R$ ${Number(sale.amount).toFixed(2)}</td>
<td style="padding:12px;font-size:14px;">${sale.date}</td>
</tr>`;
        });
      }

      // Build attempts table rows (pessoas que tentaram mas não pagaram)
      let attemptsRows = '';
      let attemptsSection = '';
      if (attemptsList && attemptsList.length > 0) {
        attemptsList.forEach((attempt: any, index: number) => {
          attemptsRows += `
<tr style="border-bottom:1px solid #e5e7eb;background:${attempt.eventuallyPaid ? '#f0fdf4' : '#fef2f2'};">
<td style="padding:12px;font-size:14px;">${index + 1}</td>
<td style="padding:12px;font-size:14px;">${attempt.email}</td>
<td style="padding:12px;font-size:14px;">${attempt.name || '-'}</td>
<td style="padding:12px;font-size:14px;"><a href="https://wa.me/${(attempt.phone || '').replace(/\D/g, '')}" style="color:#10b981;text-decoration:none;">${attempt.phone || '-'}</a></td>
<td style="padding:12px;font-size:14px;">${attempt.date}</td>
<td style="padding:12px;font-size:14px;font-weight:bold;color:${attempt.eventuallyPaid ? '#10b981' : '#ef4444'};">${attempt.eventuallyPaid ? '✅ PAGOU' : '❌ NÃO PAGOU'}</td>
</tr>`;
        });

        attemptsSection = `
<!-- Attempts Table -->
<div style="background:#fef2f2;border-radius:10px;padding:20px;margin-bottom:25px;overflow-x:auto;border:2px solid #fca5a5;">
<h3 style="color:#dc2626;margin:0 0 5px 0;font-size:16px;">🎯 TENTATIVAS - RECUPERE ESSAS VENDAS!</h3>
<p style="color:#666;margin:0 0 15px 0;font-size:13px;">Pessoas que tentaram comprar mas não finalizaram. Entre em contato para recuperar!</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border-collapse:collapse;">
<thead>
<tr style="background:#dc2626;color:#fff;">
<th style="padding:12px;text-align:left;font-size:12px;border-radius:8px 0 0 0;">#</th>
<th style="padding:12px;text-align:left;font-size:12px;">Email</th>
<th style="padding:12px;text-align:left;font-size:12px;">Nome</th>
<th style="padding:12px;text-align:left;font-size:12px;">📱 Telefone</th>
<th style="padding:12px;text-align:left;font-size:12px;">Data/Hora</th>
<th style="padding:12px;text-align:left;font-size:12px;border-radius:0 8px 0 0;">Status</th>
</tr>
</thead>
<tbody>
${attemptsRows}
</tbody>
</table>
<p style="color:#dc2626;margin:15px 0 0 0;font-size:13px;font-weight:bold;">💡 Dica: Clique no telefone para abrir o WhatsApp diretamente!</p>
</div>`;
      }

      // Build multiple attempts section (pessoas que tentaram mais de uma vez)
      let multipleAttemptsSection = '';
      if (multipleAttemptsList && multipleAttemptsList.length > 0) {
        let multipleRows = '';
        multipleAttemptsList.forEach((item: any, index: number) => {
          multipleRows += `
<tr style="border-bottom:1px solid #e5e7eb;background:${item.hasPaid ? '#f0fdf4' : '#fef9c3'};">
<td style="padding:12px;font-size:14px;">${index + 1}</td>
<td style="padding:12px;font-size:14px;">${item.email}</td>
<td style="padding:12px;font-size:14px;font-weight:bold;color:#f59e0b;">${item.totalAttempts}x</td>
<td style="padding:12px;font-size:14px;font-weight:bold;color:${item.hasPaid ? '#10b981' : '#ef4444'};">${item.hasPaid ? '✅ Finalizou' : '❌ Não Finalizou'}</td>
</tr>`;
        });

        multipleAttemptsSection = `
<!-- Multiple Attempts -->
<div style="background:#fef9c3;border-radius:10px;padding:20px;margin-bottom:25px;overflow-x:auto;border:2px solid #fbbf24;">
<h3 style="color:#d97706;margin:0 0 5px 0;font-size:16px;">🔄 TENTATIVAS MÚLTIPLAS</h3>
<p style="color:#666;margin:0 0 15px 0;font-size:13px;">Pessoas que tentaram mais de uma vez - demonstram alto interesse!</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border-collapse:collapse;">
<thead>
<tr style="background:#d97706;color:#fff;">
<th style="padding:12px;text-align:left;font-size:12px;border-radius:8px 0 0 0;">#</th>
<th style="padding:12px;text-align:left;font-size:12px;">Email</th>
<th style="padding:12px;text-align:left;font-size:12px;">Tentativas</th>
<th style="padding:12px;text-align:left;font-size:12px;border-radius:0 8px 0 0;">Status</th>
</tr>
</thead>
<tbody>
${multipleRows}
</tbody>
</table>
</div>`;
      }

      const headerTitle = isPartial 
        ? '📊 Resumo de Vendas e Tentativas'
        : '📊 Resumo Final de Vendas';
      
      const subtitle = isPartial
        ? `Resumo gerado em ${timestamp}`
        : 'Aqui está o resumo completo das suas vendas!';
      
      const footerMessage = isPartial
        ? 'A promoção continua ativa! Use as tentativas para recuperar vendas! 🚀'
        : `${promoEndTime ? `A promoção foi finalizada às ${promoEndTime}.` : 'A promoção foi finalizada.'}<br>Seu pagamento será processado em breve.`;

      // Stats for attempts
      const totalAttempts = attemptsList?.length || 0;
      const notPaidAttempts = attemptsList?.filter((a: any) => !a.eventuallyPaid).length || 0;

      htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:750px;margin:0 auto;background:#ffffff;">
<tr>
<td style="background:linear-gradient(135deg,${isPartial ? '#3b82f6 0%,#1d4ed8' : '#8b5cf6 0%,#6366f1'} 100%);padding:30px;text-align:center;">
<div style="background:#000;color:#FFD700;display:inline-block;padding:10px 25px;border-radius:8px;font-size:32px;font-weight:bold;letter-spacing:2px;margin-bottom:10px;">MRO</div>
<h1 style="color:#fff;margin:15px 0 0 0;font-size:28px;">${headerTitle}</h1>
${isPartial ? '<p style="color:#fbbf24;margin:10px 0 0 0;font-size:14px;font-weight:bold;">📍 Promoção ainda em andamento!</p>' : ''}
</td>
</tr>
<tr>
<td style="padding:30px;background:#ffffff;">

<div style="background:linear-gradient(135deg,#FFD700 0%,#FFA500 100%);padding:25px;border-radius:15px;margin-bottom:25px;text-align:center;">
<p style="margin:0;color:#000;font-size:18px;font-weight:bold;">Olá, ${finalAffiliateName.toUpperCase()}!</p>
<p style="margin:10px 0 0 0;color:#000;font-size:14px;">${subtitle}</p>
${promoStartTime && promoEndTime ? `<p style="margin:10px 0 0 0;color:#333;font-size:13px;">⏰ Promoção: ${promoStartTime} às ${promoEndTime}</p>` : ''}
</div>

<!-- Stats Cards -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:25px;">
<tr>
<td width="25%" style="padding-right:5px;">
<div style="background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:15px;text-align:center;">
<p style="margin:0;color:#666;font-size:11px;">Vendas</p>
<p style="margin:5px 0;color:#10b981;font-size:28px;font-weight:bold;">${totalSales || 0}</p>
</div>
</td>
<td width="25%" style="padding:0 5px;">
<div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:15px;text-align:center;">
<p style="margin:0;color:#666;font-size:11px;">Comissão</p>
<p style="margin:5px 0;color:#f59e0b;font-size:28px;font-weight:bold;">R$${totalCommission || '0'}</p>
</div>
</td>
<td width="25%" style="padding:0 5px;">
<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:12px;padding:15px;text-align:center;">
<p style="margin:0;color:#666;font-size:11px;">Tentativas</p>
<p style="margin:5px 0;color:#ef4444;font-size:28px;font-weight:bold;">${totalAttempts}</p>
</div>
</td>
<td width="25%" style="padding-left:5px;">
<div style="background:#fce7f3;border:2px solid #ec4899;border-radius:12px;padding:15px;text-align:center;">
<p style="margin:0;color:#666;font-size:11px;">A Recuperar</p>
<p style="margin:5px 0;color:#ec4899;font-size:28px;font-weight:bold;">${notPaidAttempts}</p>
</div>
</td>
</tr>
</table>

<!-- Sales Table -->
<div style="background:#f0fdf4;border-radius:10px;padding:20px;margin-bottom:25px;overflow-x:auto;border:2px solid #10b981;">
<h3 style="color:#10b981;margin:0 0 15px 0;font-size:16px;">✅ VENDAS CONFIRMADAS</h3>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border-collapse:collapse;">
<thead>
<tr style="background:#10b981;color:#fff;">
<th style="padding:12px;text-align:left;font-size:11px;border-radius:8px 0 0 0;">#</th>
<th style="padding:12px;text-align:left;font-size:11px;">Email</th>
<th style="padding:12px;text-align:left;font-size:11px;">Cliente</th>
<th style="padding:12px;text-align:left;font-size:11px;">📱 Tel</th>
<th style="padding:12px;text-align:left;font-size:11px;">Valor</th>
<th style="padding:12px;text-align:left;font-size:11px;border-radius:0 8px 0 0;">Data</th>
</tr>
</thead>
<tbody>
${salesRows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#666;">Nenhuma venda registrada ainda</td></tr>'}
</tbody>
</table>
</div>

${attemptsSection}

${multipleAttemptsSection}

<div style="background:${isPartial ? '#dbeafe' : '#ede9fe'};border:2px solid ${isPartial ? '#3b82f6' : '#8b5cf6'};border-radius:15px;padding:20px;text-align:center;margin-bottom:25px;">
<p style="margin:0;color:${isPartial ? '#1d4ed8' : '#6366f1'};font-size:16px;font-weight:bold;">
${notPaidAttempts > 0 ? `🎯 Você tem ${notPaidAttempts} vendas para recuperar!` : '🔥 Continue vendendo!'}
</p>
<p style="margin:10px 0 0 0;color:#666;font-size:14px;">
${footerMessage}
</p>
</div>

<div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;">
<p style="margin:0;color:#1e40af;font-size:14px;">
<strong>💡 Dica de Recuperação:</strong><br>
Entre em contato com as pessoas que tentaram comprar mas não finalizaram. Muitas vezes só precisam de um empurrãozinho!
</p>
</div>

</td>
</tr>
<tr>
<td style="background:#1a1a1a;padding:20px;text-align:center;">
<p style="color:#FFD700;margin:0 0 10px 0;font-weight:bold;">MRO - Programa de Afiliados 💛</p>
<p style="color:#888;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
<p style="color:#666;margin:10px 0 0 0;font-size:11px;">Resumo gerado em ${timestamp}</p>
</td>
</tr>
</table>
</body>
</html>`;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid type' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    await client.send({
      from: "MRO - Afiliados <suporte@maisresultadosonline.com.br>",
      to: finalAffiliateEmail,
      subject: subject,
      html: htmlContent,
    });

    await client.close();

    logStep("Email sent successfully", { type, affiliateEmail: finalAffiliateEmail });

    return new Response(
      JSON.stringify({ success: true, message: `${type} email sent to ${finalAffiliateEmail}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logStep('Error sending email', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
