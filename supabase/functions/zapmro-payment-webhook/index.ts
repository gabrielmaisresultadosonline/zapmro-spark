import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { verifyInfinitePayWebhook } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPMRO_API_URL = "https://mrozap.squareweb.app";

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [ZAPMRO-PAYMENT-WEBHOOK] ${step}${detailsStr}`);
};

// Criar usuário na API ZAPMRO
async function createZapmroUser(username: string, password: string, accessType: string): Promise<{ success: boolean; alreadyExists: boolean; message: string }> {
  try {
    log("Creating ZAPMRO user", { username, accessType });

    const apiUrl = `${ZAPMRO_API_URL}/public/api/users`;
    
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
    log("ZAPMRO API response", { status: createResponse.status, body: responseText });

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      log("ZAPMRO API returned non-JSON response", { responseText });
      return { success: createResponse.ok, alreadyExists: false, message: responseText };
    }

    if (!createResponse.ok) {
      // Verificar se é erro de usuário já existe
      if (result.message?.includes("already exists") || result.error?.includes("already exists")) {
        return { success: true, alreadyExists: true, message: "Usuário já existe" };
      }
      log("ZAPMRO user creation failed", { status: createResponse.status, result });
      return { success: false, alreadyExists: false, message: result.message || "Erro ao criar usuário" };
    }

    log("ZAPMRO user created successfully", result);
    return { success: true, alreadyExists: false, message: "Usuário criado com sucesso" };
  } catch (error: unknown) {
    log("Error creating ZAPMRO user", { error: error instanceof Error ? error.message : String(error) });
    return { success: false, alreadyExists: false, message: String(error) };
  }
}

// Enviar email de acesso ZAPMRO
async function sendAccessEmail(
  customerEmail: string,
  username: string,
  password: string,
  planType: string
): Promise<boolean> {
  try {
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) {
      log("SMTP password not configured");
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

    const memberAreaUrl = "https://maisresultadosonline.com.br/areademembros";
    const whatsappGroupLink = "https://chat.whatsapp.com/JdEHa4jeLSUKTQFCNp7YXi";
    const planLabel = planType === "lifetime" ? "Vitalício" : "Anual";

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
<tr>
<td style="background:linear-gradient(135deg,#22c55e 0%,#10b981 100%);padding:30px;text-align:center;">
<div style="background:#000;color:#22c55e;display:inline-block;padding:10px 25px;border-radius:8px;font-size:32px;font-weight:bold;letter-spacing:2px;margin-bottom:10px;">ZAPMRO</div>
<h1 style="color:#fff;margin:15px 0 0 0;font-size:24px;">🎉 Acesso Liberado!</h1>
</td>
</tr>
<tr>
<td style="padding:30px;background:#ffffff;">
<p style="margin:0 0 20px 0;">Seu acesso à <strong>Ferramenta ZAPMRO WhatsApp</strong> foi liberado com sucesso!</p>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border:2px solid #22c55e;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<h3 style="color:#333;margin:0 0 15px 0;font-size:16px;">📋 Seus Dados de Acesso:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:12px;background:#fff;border-radius:5px;margin-bottom:10px;">
<span style="font-size:12px;color:#666;display:block;">Usuário:</span>
<span style="font-size:18px;color:#000;font-family:monospace;font-weight:bold;">${username}</span>
</td>
</tr>
<tr><td style="height:10px;"></td></tr>
<tr>
<td style="padding:12px;background:#fff;border-radius:5px;">
<span style="font-size:12px;color:#666;display:block;">Senha:</span>
<span style="font-size:18px;color:#000;font-family:monospace;font-weight:bold;">${password}</span>
</td>
</tr>
</table>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:15px 0;">
<tr>
<td style="background:${planType === "lifetime" ? "#d4edda" : "#d1fae5"};border:1px solid ${planType === "lifetime" ? "#22c55e" : "#10b981"};border-radius:8px;padding:15px;text-align:center;">
<span style="color:${planType === "lifetime" ? "#15803d" : "#047857"};font-weight:bold;">
${planType === "lifetime" ? "♾️ Acesso Vitalício - Sem data de expiração!" : "🎁 Plano Anual - 365 dias de acesso"}
</span>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<h3 style="color:#333;margin:0 0 15px 0;font-size:16px;">📝 Como Acessar:</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#22c55e;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">1</span>
<span style="color:#333;">Acesse nossa página oficial</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#22c55e;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">2</span>
<span style="color:#333;">Clique em <strong>"Ferramenta para WhatsApp"</strong></span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#22c55e;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">3</span>
<span style="color:#333;">Insira seu <strong>usuário</strong> e <strong>senha</strong></span>
</td>
</tr>
<tr>
<td style="padding:10px 0;">
<span style="display:inline-block;background:#10b981;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">✓</span>
<span style="color:#333;font-weight:bold;">Pronto! Aproveite a ferramenta!</span>
</td>
</tr>
</table>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:10px 0;">
<a href="${memberAreaUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">🚀 ACESSAR ÁREA DE MEMBROS</a>
</td>
</tr>
</table>

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
<p style="margin:0;">ZAPMRO - Mais Resultados Online</p>
<p style="margin:5px 0 0 0;">Gabriel Fernandes da Silva | CNPJ: 54.840.738/0001-96</p>
</td>
</tr>
</table>
</body>
</html>`;

    await client.send({
      from: "ZAPMRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: customerEmail,
      subject: `ZAPMRO - Acesso Liberado à Ferramenta WhatsApp (${planLabel})!`,
      content: "Seu acesso foi liberado! Veja os detalhes no email.",
      html: htmlContent,
    });

    await client.close();
    log("Email sent successfully", { to: customerEmail });
    return true;
  } catch (error) {
    log("Error sending email", { error: String(error) });
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Received webhook request");

    // Verify webhook signature for security
    const verification = await verifyInfinitePayWebhook(req, corsHeaders, "ZAPMRO-PAYMENT-WEBHOOK");
    if (!verification.verified) {
      return verification.response;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const payload = verification.body;
    log("Webhook payload", payload);

    // Suportar chamada manual do admin (manual_approve)
    const manualApprove = payload.manual_approve === true;
    const resendEmailOnly = payload.resend_email_only === true;
    const orderId = payload.order_id as string | undefined;

    // Extrair dados do webhook InfiniPay
    const orderNsu = payload.order_nsu as string | undefined;
    const items = (payload.items || []) as Array<{ description?: string; name?: string }>;

    if (!orderNsu && !orderId) {
      log("No order_nsu or order_id in payload");
      return new Response(
        JSON.stringify({ success: false, message: "Missing order identifier" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Tentar extrair dados do item (formato: ZAPMRO_PLANO_username_email)
    let extractedEmail = "";
    let extractedUsername = "";
    let extractedPlan = "annual";

    for (const item of items) {
      const desc = item.description || item.name || "";
      if (desc.startsWith("ZAPMRO_")) {
        const parts = desc.split("_");
        if (parts.length >= 4) {
          extractedPlan = parts[1] === "VITALICIO" ? "lifetime" : "annual";
          extractedUsername = parts[2];
          extractedEmail = parts.slice(3).join("_");
        }
        log("Extracted from item", { extractedEmail, extractedUsername, extractedPlan });
        break;
      }
    }

    // Buscar pedido no banco
    let order = null;

    if (orderId) {
      const { data } = await supabase
        .from("zapmro_orders")
        .select("*")
        .eq("id", orderId)
        .single();
      order = data;
      log("Searched by orderId", { orderId, found: !!order });
    } else if (orderNsu) {
      const { data } = await supabase
        .from("zapmro_orders")
        .select("*")
        .eq("nsu_order", orderNsu)
        .single();
      order = data;
      log("Searched by orderNsu", { orderNsu, found: !!order });
    }

    // Fallback por email
    if (!order && extractedEmail) {
      const { data } = await supabase
        .from("zapmro_orders")
        .select("*")
        .eq("email", extractedEmail)
        .in("status", ["pending", "paid"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      order = data;
      log("Fallback search by email", { extractedEmail, found: !!order });
    }

    if (!order) {
      log("No order found", { orderNsu, orderId, extractedEmail });
      return new Response(
        JSON.stringify({ success: false, message: "No order found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Se já está completo, não processar novamente
    if (order.status === "completed" && !manualApprove && !resendEmailOnly) {
      log("Order already completed", { orderId: order.id });
      return new Response(
        JSON.stringify({ success: true, status: "completed", order, message: "Already processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    log("Processing order", { orderId: order.id, email: order.email, username: order.username, manualApprove, resendEmailOnly });

    // Se for apenas reenvio de email
    if (resendEmailOnly) {
      const customerEmail = order.email;
      log("Resending email only", { customerEmail, username: order.username });
      const emailSent = await sendAccessEmail(customerEmail, order.username, order.username, order.plan_type);
      
      if (emailSent) {
        await supabase
          .from("zapmro_orders")
          .update({
            email_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
      
      return new Response(
        JSON.stringify({ success: emailSent, message: emailSent ? "Email reenviado" : "Falha ao reenviar email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Marcar como pago
    if (order.status === "pending") {
      await supabase
        .from("zapmro_orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    }

    // Calcular tipo de acesso
    const accessType = order.plan_type === "lifetime" ? "lifetime" : "annual";

    // Criar usuário na API ZAPMRO
    const apiResult = await createZapmroUser(order.username, order.username, accessType);
    log("API user creation result", apiResult);

    // Enviar email
    const customerEmail = order.email;
    let emailSent = order.email_sent || false;
    if (!emailSent) {
      emailSent = await sendAccessEmail(customerEmail, order.username, order.username, order.plan_type);
      log("Email send result", { emailSent });
    }

    // Marcar como completo
    await supabase
      .from("zapmro_orders")
      .update({
        status: "completed",
        api_created: apiResult.success,
        email_sent: emailSent,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    log("Order processing completed", {
      orderId: order.id,
      apiCreated: apiResult.success,
      apiAlreadyExists: apiResult.alreadyExists,
      emailSent,
    });

    return new Response(
      JSON.stringify({
        success: true,
        status: "completed",
        order: { ...order, status: "completed" },
        api_created: apiResult.success,
        api_already_exists: apiResult.alreadyExists,
        email_sent: emailSent,
        message: "Order processed successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: errorMessage });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
