import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const INFINITEPAY_CHECKOUT_LINKS_URL =
  "https://api.infinitepay.io/invoices/public/checkout/links";

const REDIRECT_URL = "https://pay.maisresultadosonline.com.br/anuncios/obrigado";

const log = (step: string, details?: unknown) => {
  console.log(
    `[ADS-CHECKOUT] ${step}:`,
    details ? JSON.stringify(details, null, 2) : "",
  );
};

const generateNSU = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `ADS${timestamp}${randomPart}`.toUpperCase();
};

const getCheckoutUrl = (data: any): string | null => {
  return data?.checkout_url || data?.checkoutUrl || data?.link || data?.url || null;
};

// Função para enviar email de cadastro (antes do pagamento)
const sendRegistrationEmail = async (email: string, name: string, password: string) => {
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

    const loginUrl = 'https://pay.maisresultadosonline.com.br/anuncios';
    const year = new Date().getFullYear();

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Complete seu pagamento - Ads News</title>
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
<h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Falta pouco para comecar!</h1>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding: 30px;">

<!-- Alert Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
<tr>
<td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 20px; border-radius: 10px; text-align: center;">
<p style="margin: 0; color: #ffffff; font-size: 16px; font-weight: bold;">Seu cadastro foi realizado com sucesso!</p>
<p style="margin: 10px 0 0 0; color: #ffffff; font-size: 14px;">Agora finalize o pagamento para liberar seu acesso.</p>
</td>
</tr>
</table>

<p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">Ola <strong>${name}</strong>!</p>

<p style="margin: 0 0 15px 0; font-size: 16px; color: #333333;">Voce esta a um passo de comecar a receber <strong>leads direto no seu WhatsApp</strong> o dia todo!</p>

<p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">Guarde seus dados de acesso:</p>

<!-- Credentials Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 2px solid #3b82f6; border-radius: 10px; margin-bottom: 25px;">
<tr>
<td style="padding: 20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding: 10px; background-color: #ffffff; border-radius: 5px; margin-bottom: 10px;">
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
</table>
</td>
</tr>
</table>

<!-- Steps -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
<tr>
<td>
<p style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; color: #333333;">Para liberar seu acesso:</p>
</td>
</tr>
<tr>
<td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width: 30px; vertical-align: top;">
<span style="display: inline-block; background-color: #3b82f6; color: #ffffff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: bold; font-size: 14px;">1</span>
</td>
<td style="padding-left: 10px; color: #333333; font-size: 15px;">Clique no botao abaixo para acessar a pagina de login</td>
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
<td style="padding-left: 10px; color: #333333; font-size: 15px;">Faca login com seu email e senha acima</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding: 10px 0;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="width: 30px; vertical-align: top;">
<span style="display: inline-block; background-color: #10b981; color: #ffffff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: bold; font-size: 14px;">3</span>
</td>
<td style="padding-left: 10px; color: #333333; font-size: 15px;">Complete o pagamento para liberar seu acesso</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- CTA Button -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="text-align: center; padding: 10px 0 25px 0;">
<a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">Acessar e Pagar Agora</a>
</td>
</tr>
</table>

<!-- Benefits -->
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

<!-- Warning -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 0 8px 8px 0;">
<tr>
<td style="padding: 15px;">
<p style="margin: 0; color: #9a3412; font-size: 14px;"><strong>Importante:</strong> O link de pagamento expira em 10 minutos. Apos esse prazo, sera necessario fazer login novamente.</p>
</td>
</tr>
</table>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color: #1a1a1a; padding: 20px; text-align: center;">
<p style="color: #3b82f6; margin: 0 0 10px 0; font-weight: bold; font-size: 14px;">Ads News - Leads no seu WhatsApp</p>
<p style="color: #888888; margin: 0; font-size: 12px;">${year} Ads News - Todos os direitos reservados</p>
<p style="color: #666666; margin: 10px 0 0 0; font-size: 11px;">Duvidas? WhatsApp: +55 51 9203-6540</p>
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
      subject: "Complete seu pagamento - Ads News",
      html: htmlContent,
    });

    await client.close();
    log("Registration email sent successfully", { email });
    return true;
  } catch (error) {
    log("Error sending registration email", error);
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

    const body = await req.json();
    const {
      name,
      email,
      password,
      phone,
      amount = 1,
      type = "initial",
      userId,
      leadsQuantity,
    } = body;

    log("Request received", { name, email, type, amount });

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "Email inválido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const nsuOrder = generateNSU();
    const priceInCents = Math.round(Number(amount) * 100);

    // Webhook URL para receber notificação de pagamento (em tempo real)
    const webhookUrl = `${supabaseUrl}/functions/v1/ads-webhook`;

    // Item no formato da doc: description/quantity/price
    const description = `anun_${cleanEmail}`;
    const lineItems = [{ description, quantity: 1, price: priceInCents }];

    const infinitepayPayload: Record<string, unknown> = {
      handle: INFINITEPAY_HANDLE,
      items: lineItems,
      itens: lineItems,
      order_nsu: nsuOrder,
      redirect_url: REDIRECT_URL,
      webhook_url: webhookUrl,
      customer: {
        email: cleanEmail,
        ...(name ? { name } : {}),
        ...(phone ? { phone_number: phone } : {}),
      },
    };

    log("Calling InfiniPay checkout/links", {
      order_nsu: nsuOrder,
      webhook_url: webhookUrl,
      description,
      priceInCents,
    });

    const infinitepayResponse = await fetch(INFINITEPAY_CHECKOUT_LINKS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(infinitepayPayload),
    });

    const infinitepayData = await infinitepayResponse.json().catch(() => ({}));
    log("InfiniPay response", {
      status: infinitepayResponse.status,
      ok: infinitepayResponse.ok,
      data: infinitepayData,
    });

    if (!infinitepayResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Erro ao criar link de pagamento",
          details: infinitepayData,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const paymentLink = getCheckoutUrl(infinitepayData);
    if (!paymentLink) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Resposta da InfinitePay sem checkout_url",
          details: infinitepayData,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (type === "initial") {
      // Garante usuário (case-insensitive)
      const { data: existingUser } = await supabase
        .from("ads_users")
        .select("id")
        .ilike("email", cleanEmail)
        .maybeSingle();

      let isNewUser = false;
      if (!existingUser && name && password) {
        const { data: newUser, error: userError } = await supabase
          .from("ads_users")
          .insert({
            name,
            email: cleanEmail,
            password,
            phone: phone || null,
            status: "pending",
          })
          .select("id")
          .single();

        if (userError) {
          log("Error creating user", userError);
        } else {
          log("User created", newUser);
          isNewUser = true;
        }
      }

      // Cria pedido
      const { data: order, error: orderError } = await supabase
        .from("ads_orders")
        .insert({
          email: cleanEmail,
          name: name || cleanEmail.split("@")[0],
          amount: Number(amount),
          nsu_order: nsuOrder,
          infinitepay_link: paymentLink,
          status: "pending",
          expired_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (orderError) {
        log("Error creating order", orderError);
        throw orderError;
      }

      log("Order created", order);

      // Enviar email de cadastro automaticamente para novos usuários
      if (isNewUser && name && password) {
        log("Sending registration email to new user", { email: cleanEmail });
        await sendRegistrationEmail(cleanEmail, name, password);
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentLink,
          nsuOrder,
          orderId: order.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (type === "balance") {
      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: "userId é obrigatório" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: balanceOrder, error: balanceError } = await supabase
        .from("ads_balance_orders")
        .insert({
          user_id: userId,
          amount: Number(amount),
          leads_quantity: Number(leadsQuantity || 0),
          nsu_order: nsuOrder,
          infinitepay_link: paymentLink,
          status: "pending",
        })
        .select()
        .single();

      if (balanceError) {
        log("Error creating balance order", balanceError);
        throw balanceError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentLink,
          nsuOrder,
          orderId: balanceOrder.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Tipo de operação inválido" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    log("Error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
