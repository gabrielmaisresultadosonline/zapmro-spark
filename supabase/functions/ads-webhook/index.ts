import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { verifyInfinitePayWebhook } from "../_shared/webhook-security.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const log = (step: string, details?: unknown) => {
  console.log(`[ADS-WEBHOOK] ${step}:`, details ? JSON.stringify(details, null, 2) : '');
};

// Email de boas-vindas após pagamento confirmado
const sendWelcomeEmail = async (email: string, name: string, password: string, subscriptionEnd: Date) => {
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

    const dashboardUrl = 'https://pay.maisresultadosonline.com.br/anuncios/dash';
    const year = new Date().getFullYear();
    const formattedDate = subscriptionEnd.toLocaleDateString('pt-BR');

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pagamento Confirmado - Ads News</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px 0;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

<!-- Header -->
<tr>
<td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
<img src="https://pay.maisresultadosonline.com.br/ads-news-full.png" alt="Ads News" style="height: 50px; margin-bottom: 15px;">
<h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Pagamento Confirmado!</h1>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding: 30px;">

<!-- Success Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
<tr>
<td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 10px; text-align: center;">
<p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">Seu acesso foi liberado com sucesso!</p>
</td>
</tr>
</table>

<p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">Ola <strong>${name}</strong>!</p>

<p style="margin: 0 0 15px 0; font-size: 16px; color: #333333;">Recebemos seu pagamento e seu acesso ao <strong>Ads News</strong> ja esta liberado!</p>

<p style="margin: 0 0 15px 0; font-size: 16px; color: #333333;">Agora vamos trabalhar juntos para gerar leads no seu WhatsApp. Complete as informacoes do seu negocio no painel para iniciarmos suas campanhas.</p>

<!-- Credentials Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 2px solid #3b82f6; border-radius: 10px; margin-bottom: 25px;">
<tr>
<td style="padding: 20px;">
<p style="margin: 0 0 15px 0; font-size: 14px; font-weight: bold; color: #333333;">Seus Dados de Acesso:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding: 10px; background-color: #ffffff; border-radius: 5px;">
<span style="font-size: 12px; color: #666666; display: block; margin-bottom: 5px;">Email:</span>
<span style="font-size: 16px; color: #1e40af; font-weight: bold;">${email}</span>
</td>
</tr>
<tr><td style="height: 10px;"></td></tr>
<tr>
<td style="padding: 10px; background-color: #ffffff; border-radius: 5px;">
<span style="font-size: 12px; color: #666666; display: block; margin-bottom: 5px;">Senha:</span>
<span style="font-size: 16px; color: #1e40af; font-weight: bold;">${password}</span>
</td>
</tr>
<tr><td style="height: 10px;"></td></tr>
<tr>
<td style="padding: 12px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 5px; text-align: center;">
<span style="font-size: 14px; font-weight: bold; color: #ffffff;">Assinatura ate: ${formattedDate}</span>
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Steps -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border-radius: 10px; margin-bottom: 25px;">
<tr>
<td style="padding: 20px;">
<p style="margin: 0 0 15px 0; font-size: 14px; font-weight: bold; color: #333333;">Proximos Passos:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width: 30px; vertical-align: top;">
<span style="display: inline-block; background-color: #3b82f6; color: #ffffff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: bold; font-size: 14px;">1</span>
</td>
<td style="padding-left: 10px; color: #333333; font-size: 15px;">Acesse o Dashboard com seu email e senha</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width: 30px; vertical-align: top;">
<span style="display: inline-block; background-color: #3b82f6; color: #ffffff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: bold; font-size: 14px;">2</span>
</td>
<td style="padding-left: 10px; color: #333333; font-size: 15px;">Preencha as informacoes do seu negocio</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width: 30px; vertical-align: top;">
<span style="display: inline-block; background-color: #3b82f6; color: #ffffff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: bold; font-size: 14px;">3</span>
</td>
<td style="padding-left: 10px; color: #333333; font-size: 15px;">Adicione saldo para suas campanhas</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding: 10px 0;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width: 30px; vertical-align: top;">
<span style="display: inline-block; background-color: #10b981; color: #ffffff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: bold; font-size: 14px;">4</span>
</td>
<td style="padding-left: 10px; color: #333333; font-size: 15px; font-weight: bold;">Pronto! Vamos criar suas campanhas!</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- CTA Button -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="text-align: center; padding: 10px 0 25px 0;">
<a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">Acessar Meu Dashboard</a>
</td>
</tr>
</table>

<!-- What you get -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; border-radius: 10px; margin-bottom: 20px;">
<tr>
<td style="padding: 20px;">
<p style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; color: #166534;">O que voce vai receber:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding: 5px 0; color: #166534; font-size: 14px;">Leads direto no WhatsApp o dia todo</td>
</tr>
<tr>
<td style="padding: 5px 0; color: #166534; font-size: 14px;">Criativos profissionais para suas campanhas</td>
</tr>
<tr>
<td style="padding: 5px 0; color: #166534; font-size: 14px;">Campanhas no Facebook, Instagram e WhatsApp</td>
</tr>
<tr>
<td style="padding: 5px 0; color: #166534; font-size: 14px;">Suporte dedicado via WhatsApp</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Contact -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 0 8px 8px 0;">
<tr>
<td style="padding: 15px;">
<p style="margin: 0; color: #9a3412; font-size: 14px;"><strong>Duvidas?</strong> Entre em contato pelo WhatsApp: <a href="https://wa.me/5551920356540" style="color: #9a3412;">+55 51 9203-6540</a></p>
</td>
</tr>
</table>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color: #1a1a1a; padding: 20px; text-align: center;">
<p style="color: #3b82f6; margin: 0 0 10px 0; font-weight: bold; font-size: 14px;">Bem-vindo ao Ads News!</p>
<p style="color: #888888; margin: 0; font-size: 12px;">${year} Ads News - Todos os direitos reservados</p>
<p style="color: #666666; margin: 10px 0 0 0; font-size: 11px;">Este email foi enviado porque voce contratou nossos servicos de anuncios.</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

    await client.send({
      from: "Ads News <suporte@maisresultadosonline.com.br>",
      to: email,
      subject: "Pagamento Confirmado - Seu acesso ao Ads News esta liberado!",
      html: htmlContent,
    });

    await client.close();
    log("Welcome email sent successfully", { email });
    return true;
  } catch (error) {
    log("Error sending welcome email", error);
    return false;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook signature for security
    const verification = await verifyInfinitePayWebhook(req, corsHeaders, "ADS-WEBHOOK");
    if (!verification.verified) {
      return verification.response;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = verification.body;
    log('Webhook received - FULL PAYLOAD', payload);

    // Extract payment info from InfiniPay webhook - support multiple formats
    const status = payload.status as string | undefined;
    const nsu = payload.nsu as string | undefined;
    const order_nsu = payload.order_nsu as string | undefined;
    const amount = payload.amount as number | undefined;
    const paid_amount = payload.paid_amount as number | undefined;
    const receipt_url = payload.receipt_url as string | undefined;
    const transaction_nsu = payload.transaction_nsu as string | undefined;
    const invoice_slug = payload.invoice_slug as string | undefined;
    const items = payload.items as Array<{ name?: string; description?: string; product_name?: string }> | undefined;
    const payment_status = payload.payment_status as string | undefined;
    const transaction_status = payload.transaction_status as string | undefined;
    const payment = payload.payment as Record<string, unknown> | undefined;
    const transaction = payload.transaction as Record<string, unknown> | undefined;
    const data = payload.data as Record<string, unknown> | undefined;

    // Try to get nested data
    const nestedStatus = (payment?.status || transaction?.status || data?.status) as string | undefined;
    const nestedNsu = (payment?.nsu || transaction?.nsu || data?.nsu || data?.order_nsu) as string | undefined;
    const nestedItems = (payment?.items || transaction?.items || data?.items) as Array<{ name?: string; description?: string; product_name?: string }> | undefined;

    // Evidence-based fields
    const totalAmount =
      typeof amount === "number"
        ? amount
        : typeof data?.amount === "number"
          ? data.amount as number
          : undefined;

    const paidAmount =
      typeof paid_amount === "number"
        ? paid_amount
        : typeof data?.paid_amount === "number"
          ? data.paid_amount as number
          : undefined;

    const receiptUrl =
      typeof receipt_url === "string"
        ? receipt_url
        : typeof data?.receipt_url === "string"
          ? data.receipt_url as string
          : undefined;

    const transactionNsu =
      typeof transaction_nsu === "string"
        ? transaction_nsu
        : typeof data?.transaction_nsu === "string"
          ? data.transaction_nsu as string
          : undefined;

    // Check if payment is confirmed
    const evidencePaid =
      (typeof paidAmount === "number" && typeof totalAmount === "number" && paidAmount >= totalAmount && paidAmount > 0) ||
      Boolean(receiptUrl) ||
      Boolean(transactionNsu) ||
      (typeof invoice_slug === "string" && typeof paidAmount === "number" && paidAmount > 0);

    const isPaid =
      status === "approved" ||
      status === "paid" ||
      status === "confirmed" ||
      status === "completed" ||
      payment_status === "approved" ||
      payment_status === "paid" ||
      transaction_status === "approved" ||
      transaction_status === "paid" ||
      nestedStatus === "approved" ||
      nestedStatus === "paid" ||
      nestedStatus === "confirmed" ||
      evidencePaid;

    log("Payment status check", {
      status,
      payment_status,
      transaction_status,
      nestedStatus,
      totalAmount,
      paidAmount,
      hasReceiptUrl: Boolean(receiptUrl),
      hasTransactionNsu: Boolean(transactionNsu),
      isPaid,
    });

    if (!isPaid) {
      log("Payment not confirmed yet");
      return new Response(
        JSON.stringify({ success: true, message: "Payment not yet confirmed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract email from product name (anun_EMAIL or saldoanun_EMAIL format)
    let customerEmail = '';
    let isBalancePayment = false;
    const allItems = items || nestedItems || [];
    
    if (Array.isArray(allItems)) {
      for (const item of allItems) {
        const itemName = item.name || item.description || item.product_name || '';
        log('Checking item', { itemName });
        
        // Check for balance payment format first (saldoanun_EMAIL)
        if (itemName.startsWith('saldoanun_')) {
          customerEmail = itemName.replace('saldoanun_', '');
          isBalancePayment = true;
          log('Found BALANCE payment email', { customerEmail, isBalancePayment });
          break;
        }
        // Check for initial payment format (anun_EMAIL)
        if (itemName.startsWith('anun_')) {
          customerEmail = itemName.replace('anun_', '');
          isBalancePayment = false;
          log('Found INITIAL payment email', { customerEmail, isBalancePayment });
          break;
        }
      }
    }

    // Try to extract from other payload fields
    if (!customerEmail) {
      const payloadStr = JSON.stringify(payload);
      // Try balance format first
      const balanceEmailMatch = payloadStr.match(/saldoanun_([^"]+@[^"]+)/);
      if (balanceEmailMatch) {
        customerEmail = balanceEmailMatch[1];
        isBalancePayment = true;
        log('Found BALANCE email via regex', customerEmail);
      } else {
        // Try initial format
        const emailMatch = payloadStr.match(/anun_([^"]+@[^"]+)/);
        if (emailMatch) {
          customerEmail = emailMatch[1];
          isBalancePayment = false;
          log('Found INITIAL email via regex', customerEmail);
        }
      }
    }

    // Try to find by NSU if email not found
    const orderNsu = nsu || order_nsu || nestedNsu;
    if (!customerEmail && orderNsu) {
      log("Trying to find by NSU", orderNsu);
      const { data: orderByNsu } = await supabase
        .from("ads_orders")
        .select("email")
        .eq("nsu_order", orderNsu)
        .maybeSingle();

      if (orderByNsu?.email) {
        customerEmail = orderByNsu.email;
        isBalancePayment = false;
        log("Found email by NSU (initial order)", customerEmail);
      } else {
        // Try balance orders
        const { data: balanceOrderByNsu } = await supabase
          .from("ads_balance_orders")
          .select("user_id")
          .eq("nsu_order", orderNsu)
          .maybeSingle();
        
        if (balanceOrderByNsu) {
          const { data: userByBalance } = await supabase
            .from("ads_users")
            .select("email")
            .eq("id", balanceOrderByNsu.user_id)
            .maybeSingle();
          
          if (userByBalance?.email) {
            customerEmail = userByBalance.email;
            isBalancePayment = true;
            log("Found email by balance NSU", customerEmail);
          }
        }
      }
    }

    if (!customerEmail) {
      log('No email found in webhook - cannot process');
      return new Response(
        JSON.stringify({ success: false, error: 'No email found in webhook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log('Processing payment', { customerEmail, isBalancePayment });

    // If this is explicitly a balance payment, process balance first
    if (isBalancePayment) {
      log('Processing as BALANCE payment');
      
      const { data: user } = await supabase
        .from('ads_users')
        .select('id, email, name')
        .ilike('email', customerEmail)
        .maybeSingle();

      if (user) {
        const { data: balanceOrder } = await supabase
          .from('ads_balance_orders')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (balanceOrder) {
          log('Found pending balance order', balanceOrder);
          
          const { error: updateError } = await supabase
            .from('ads_balance_orders')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString()
            })
            .eq('id', balanceOrder.id);

          if (updateError) {
            log('Error updating balance order', updateError);
          } else {
            log('Balance order marked as paid successfully');
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              type: 'balance', 
              orderId: balanceOrder.id,
              email: customerEmail,
              message: 'Balance order paid successfully'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      log('No pending balance order found for user');
    }

    // Check initial subscription orders
    const { data: order, error: orderError } = orderNsu
      ? await supabase
          .from("ads_orders")
          .select("*")
          .eq("nsu_order", orderNsu)
          .eq("status", "pending")
          .maybeSingle()
      : await supabase
          .from("ads_orders")
          .select("*")
          .ilike("email", customerEmail)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (order && !orderError) {
      log('Found pending initial order', order);
      
      // Update order status
      const { error: updateOrderError } = await supabase
        .from('ads_orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          invoice_slug: (invoice_slug || data?.invoice_slug || null) as string | null,
          transaction_nsu: transactionNsu || null
        })
        .eq('id', order.id);

      if (updateOrderError) {
        log('Error updating order', updateOrderError);
      } else {
        log('Order marked as paid', { 
          invoice_slug: invoice_slug || data?.invoice_slug,
          transaction_nsu: transactionNsu
        });
      }

      // Get user details for email
      const { data: user } = await supabase
        .from("ads_users")
        .select("*")
        .ilike("email", customerEmail)
        .maybeSingle();

      // Update user status and subscription dates
      const subscriptionStart = new Date();
      const subscriptionEnd = new Date();
      subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

      const { error: updateUserError } = await supabase
        .from("ads_users")
        .update({
          status: "active",
          subscription_start: subscriptionStart.toISOString(),
          subscription_end: subscriptionEnd.toISOString(),
        })
        .ilike("email", customerEmail);

      if (updateUserError) {
        log('Error updating user', updateUserError);
      } else {
        log('User activated with 30-day subscription', { 
          email: customerEmail,
          subscriptionEnd: subscriptionEnd.toISOString()
        });
      }

      // Send welcome email with credentials
      if (user) {
        await sendWelcomeEmail(customerEmail, user.name || order.name, user.password, subscriptionEnd);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          type: 'initial', 
          orderId: order.id,
          message: 'User activated successfully and email sent'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback: Check balance orders if not explicitly a balance payment
    if (!isBalancePayment) {
      const { data: balanceOrders } = await supabase
        .from('ads_balance_orders')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (balanceOrders && balanceOrders.length > 0) {
        const { data: user } = await supabase
          .from('ads_users')
          .select('id')
          .ilike('email', customerEmail)
          .maybeSingle();

        if (user) {
          const balanceOrder = balanceOrders.find(bo => bo.user_id === user.id);
          
          if (balanceOrder) {
            log('Found pending balance order (fallback)', balanceOrder);
            
            const { error: updateError } = await supabase
              .from('ads_balance_orders')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString()
              })
              .eq('id', balanceOrder.id);

            if (updateError) {
              log('Error updating balance order', updateError);
            } else {
              log('Balance order marked as paid');
            }

            return new Response(
              JSON.stringify({ 
                success: true, 
                type: 'balance', 
                orderId: balanceOrder.id,
                message: 'Balance order paid successfully'
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    }

    log('No pending order found for email', customerEmail);
    return new Response(
      JSON.stringify({ success: false, error: 'No pending order found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    log('Error processing webhook', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
