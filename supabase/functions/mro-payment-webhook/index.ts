import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { verifyInfinitePayWebhook } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INSTAGRAM_API_URL = "https://dashboardmroinstagramvini-online.squareweb.app";

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [MRO-PAYMENT-WEBHOOK] ${step}${detailsStr}`);
};

// Send Purchase event to Meta Conversions API (server-side pixel for /instagram-nova)
async function sendMetaPurchaseEvent(email: string, value: number, contentName: string) {
  try {
    const accessToken = Deno.env.get("META_CONVERSIONS_API_TOKEN");
    if (!accessToken) {
      log("META: No access token configured, skipping Purchase event");
      return;
    }
    const PIXEL_ID = "569414052132145";
    const hashedEmail = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(email.toLowerCase().trim()))
      .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));

    const payload = {
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: "https://maisresultadosonline.com.br/instagram-nova",
        user_data: { em: [hashedEmail] },
        custom_data: { currency: "BRL", value, content_name: contentName },
      }],
    };

    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${accessToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const result = await resp.json().catch(() => ({}));
    log("META Purchase event sent", { email, value, contentName, success: resp.ok, result });
  } catch (err) {
    log("META Purchase event error (non-blocking)", { error: String(err) });
  }
}

// Verificar se usuário já existe
async function checkUserExists(username: string): Promise<boolean> {
  try {
    log("Checking if user exists", { username });
    const response = await fetch(`${INSTAGRAM_API_URL}/api/users/${username}`);
    
    if (response.ok) {
      const data = await response.json();
      const exists = !!(data && data.username);
      log("User check result", { username, exists });
      return exists;
    }
    return false;
  } catch (error) {
    log("Error checking user existence", { username, error: String(error) });
    return false;
  }
}

// Criar usuário na API SquareCloud/Instagram
async function createInstagramUser(username: string, password: string, daysAccess: number): Promise<{ success: boolean; alreadyExists: boolean; message: string }> {
  try {
    log("Creating Instagram user", { username, daysAccess });

    // Primeiro verificar se já existe
    const alreadyExists = await checkUserExists(username);
    if (alreadyExists) {
      log("User already exists - skipping creation", { username });
      return { 
        success: true, 
        alreadyExists: true, 
        message: "Usuário já existe - criado manualmente anteriormente" 
      };
    }

    // Primeiro habilitar usuário
    const enableResponse = await fetch(`${INSTAGRAM_API_URL}/habilitar-usuario/${username}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: username, senha: password }),
    });

    log("Enable user response", { status: enableResponse.status });

    // Adicionar usuário
    const addResponse = await fetch(`${INSTAGRAM_API_URL}/adicionar-usuario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        time: daysAccess,
        igUsers: "",
      }),
    });

    const result = await addResponse.json();
    log("Add user result", result);

    if (addResponse.ok) {
      return { success: true, alreadyExists: false, message: "Usuário criado com sucesso" };
    } else {
      // Se falhou, verificar se é porque já existe
      const existsNow = await checkUserExists(username);
      if (existsNow) {
        log("User creation failed but user exists - treating as success", { username });
        return { 
          success: true, 
          alreadyExists: true, 
          message: "Usuário já existia ou foi criado" 
        };
      }
      return { success: false, alreadyExists: false, message: "Erro ao criar usuário" };
    }
  } catch (error) {
    log("Error creating Instagram user", { error: String(error) });
    
    // Mesmo com erro, verificar se usuário existe (pode ter sido criado manualmente)
    try {
      const existsNow = await checkUserExists(username);
      if (existsNow) {
        log("Error occurred but user exists - treating as manual creation", { username });
        return { 
          success: true, 
          alreadyExists: true, 
          message: "Usuário já existe (criado manualmente)" 
        };
      }
    } catch (e) {
      // Ignorar erro na verificação
    }
    
    return { success: false, alreadyExists: false, message: String(error) };
  }
}

// Enviar email de acesso
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

    const memberAreaUrl = "https://maisresultadosonline.com.br";
    const whatsappGroupLink = "https://chat.whatsapp.com/JdEHa4jeLSUKTQFCNp7YXi";
    const planLabel = planType === "lifetime" ? "Vitalício" : planType === "trial" ? "Teste 30 Dias" : "Anual";

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
<p style="margin:0 0 20px 0;">Seu acesso à <strong>Ferramenta MRO Instagram</strong> foi liberado com sucesso!</p>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border:2px solid #FFD700;border-radius:10px;margin:20px 0;">
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
        <td style="background:${planType === "lifetime" ? "#d4edda" : planType === "trial" ? "#d1ecf1" : "#fff3cd"};border:1px solid ${planType === "lifetime" ? "#28a745" : planType === "trial" ? "#17a2b8" : "#ffc107"};border-radius:8px;padding:15px;text-align:center;">
          <span style="color:${planType === "lifetime" ? "#155724" : planType === "trial" ? "#0c5460" : "#856404"};font-weight:bold;">
          ${planType === "lifetime" ? "♾️ Acesso Vitalício - Sem data de expiração!" : planType === "trial" ? "🚀 Plano Teste - 30 dias de acesso (sem recorrência)" : "🎁 Plano Anual - 365 dias de acesso"}
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
<span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">1</span>
<span style="color:#333;">Acesse nossa página oficial</span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">2</span>
<span style="color:#333;">Clique em <strong>"Área de Membros"</strong></span>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid #e0e0e0;">
<span style="display:inline-block;background:#FFD700;color:#000;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">3</span>
<span style="color:#333;">Insira seu <strong>usuário</strong> e <strong>senha</strong></span>
</td>
</tr>
<tr>
<td style="padding:10px 0;">
<span style="display:inline-block;background:#25D366;color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;margin-right:10px;">✓</span>
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
<a href="${memberAreaUrl}" style="display:inline-block;background:#000;color:#fff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">🚀 ACESSAR ÁREA DE MEMBROS</a>
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
<p style="margin:0;">MRO - Mais Resultados Online</p>
<p style="margin:5px 0 0 0;">Gabriel Fernandes da Silva | CNPJ: 54.840.738/0001-96</p>
</td>
</tr>
</table>
</body>
</html>`;

    await client.send({
      from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: customerEmail,
      subject: `MRO - Acesso Liberado à Ferramenta Instagram (${planLabel})!`,
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
    const verification = await verifyInfinitePayWebhook(req, corsHeaders, "MRO-PAYMENT-WEBHOOK");
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

    // Tentar extrair dados do item (formato: MROIG_PLANO_username_email)
    let extractedEmail = "";
    let extractedUsername = "";
    let extractedPlan = "annual";

    for (const item of items) {
      const desc = item.description || item.name || "";
      if (desc.startsWith("MROIG_")) {
        const parts = desc.split("_");
        if (parts.length >= 4) {
          extractedPlan = parts[1] === "VITALICIO" ? "lifetime" : parts[1] === "TRIAL" ? "trial" : "annual";
          extractedUsername = parts[2];
          extractedEmail = parts.slice(3).join("_"); // Email pode ter underscores
        }
        log("Extracted from item", { extractedEmail, extractedUsername, extractedPlan });
        break;
      }
    }

    // Buscar pedido no banco
    // Prioridade: order_id > order_nsu > fallback por email (apenas 1x por email)
    let order = null;

    if (orderId) {
      // Busca por ID - mais específica e confiável
      const { data } = await supabase
        .from("mro_orders")
        .select("*")
        .eq("id", orderId)
        .single();
      order = data;
      log("Searched by orderId", { orderId, found: !!order });
    } else if (orderNsu) {
      // Busca por NSU - cada pedido tem um NSU único
      const { data } = await supabase
        .from("mro_orders")
        .select("*")
        .eq("nsu_order", orderNsu)
        .single();
      order = data;
      log("Searched by orderNsu", { orderNsu, found: !!order });
    }

    // Fallback por email (somente 1 pedido por email: o mais recente)
    // Útil quando o provedor envia payload sem order_id/nsu válido, mas com itens contendo email.
    if (!order && extractedEmail) {
      const { data } = await supabase
        .from("mro_orders")
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

    // Se já está completo, não processar novamente (exceto se for apenas reenviar email)
    if (order.status === "completed" && !manualApprove && !resendEmailOnly) {
      log("Order already completed", { orderId: order.id });
      return new Response(
        JSON.stringify({ success: true, status: "completed", order, message: "Already processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    log("Processing order", { orderId: order.id, email: order.email, username: order.username, manualApprove, resendEmailOnly });

    // Se for apenas reenvio de email, pular o resto e ir direto para o envio
    if (resendEmailOnly) {
      // Determinar email real do cliente (remover prefixo de afiliado se houver)
      let customerEmail = order.email;
      const emailParts = order.email.split(":");
      if (emailParts.length >= 2) {
        customerEmail = emailParts.slice(1).join(":");
      }

      log("Resending email only", { customerEmail, username: order.username });
      const emailSent = await sendAccessEmail(customerEmail, order.username, order.username, order.plan_type);
      
      if (emailSent) {
        await supabase
          .from("mro_orders")
          .update({
            email_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
      
      log("Email resend result", { emailSent, customerEmail });
      
      return new Response(
        JSON.stringify({ success: emailSent, message: emailSent ? "Email reenviado" : "Falha ao reenviar email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Marcar como pago (se ainda não estava) usando atualização atômica para evitar race conditions
    if (order.status === "pending") {
      const { data: updatedOrder, error: updateError } = await supabase
        .from("mro_orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending")
        .select()
        .single();
      
      if (updateError || !updatedOrder) {
        log("Order already being processed by another request (race condition)", { orderId: order.id });
        return new Response(
          JSON.stringify({ success: true, message: "Already processing" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
      order = updatedOrder;
    }

    // Calcular dias de acesso
    const daysAccess = order.plan_type === "lifetime" ? 999999 : order.plan_type === "trial" ? 30 : 365;

    // Criar usuário na API do SquareCloud (ou verificar se já existe)
    const apiResult = await createInstagramUser(order.username, order.username, daysAccess);
    log("API user creation result", apiResult);

    // Determinar email real do cliente (remover prefixo de afiliado se houver)
    let customerEmail = order.email;
    const emailParts = order.email.split(":");
    if (emailParts.length >= 2) {
      customerEmail = emailParts.slice(1).join(":");
    }

    // Enviar email (SEMPRE enviar, mesmo se usuário já existia)
    let emailSent = order.email_sent || false;
    if (!emailSent) {
      emailSent = await sendAccessEmail(customerEmail, order.username, order.username, order.plan_type);
      log("Email send result", { emailSent });
    } else {
      log("Email already sent previously, skipping");
    }

    // Marcar como completo usando atualização atômica para evitar processamento duplicado
    const { data: completedOrder, error: completeError } = await supabase
      .from("mro_orders")
      .update({
        status: "completed",
        api_created: apiResult.success,
        email_sent: emailSent,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .neq("status", "completed") // Importante: só move para completo se já não estiver
      .select()
      .single();

    if (completeError || !completedOrder) {
      log("Order already completed by another request, skipping final actions", { orderId: order.id });
      return new Response(
        JSON.stringify({ success: true, message: "Already completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    order = completedOrder;

    log("Order completed successfully", { 
      orderId: order.id, 
      apiCreated: order.api_created, 
      emailSent: order.email_sent 
    });

    // Fire Meta Conversions API Purchase event
    const planLabel = order.plan_type === "lifetime" ? "Vitalício" : order.plan_type === "trial" ? "Teste 30 Dias" : "Anual";
    await sendMetaPurchaseEvent(
      customerEmail,
      Number(order.amount) || (order.plan_type === "lifetime" ? 797 : 397),
      `MRO Instagram ${planLabel}`
    );

    // Enviar para o CRM Webhook se estiver configurado e ainda não enviado
    try {
      if (order.phone && !order.whatsapp_sent) {
        let cleanPhone = order.phone.replace(/\D/g, "");
        if (cleanPhone.length <= 11 && !cleanPhone.startsWith("55")) {
          cleanPhone = `55${cleanPhone}`;
        }
        
        // Buscar a configuração atual do modo de WhatsApp e o template
        const { data: webhookConfig } = await supabase
          .from("crm_webhooks")
          .select("id, secret_token, metadata, message_template")
          .eq("id", "0c578c9d-4e33-48be-91dd-63f98d7ff430")
          .single();

        const MEMBER_LINK = "https://maisresultadosonline.com.br/instagram";
        const GROUP_LINK = "https://chat.whatsapp.com/JdEHa4jeLSUKTQFCNp7YXi";

        const template = webhookConfig?.message_template || `Obrigado por fazer parte do nosso sistema!✅

🚀🔥 *Ferramenta para Instagram Vip acesso!*

Preciso que assista os vídeos da área de membros com o link abaixo:

( {member_link} ) 

1 - Acesse Área Membros

2 - Acesse ferramenta para instagram

Para acessar a ferramenta e área de membros, utilize os acessos:

*usuário:* {username}
*senha:* {username}

⚠ Assista todos os vídeos, por favor!

Participe também do nosso GRUPO DE AVISOS
{group_link}`;

        const messageText = template
          .replace(/{username}/g, order.username)
          .replace(/{member_link}/g, MEMBER_LINK)
          .replace(/{group_link}/g, GROUP_LINK)
          .replace(/{email}/g, order.email)
          .replace(/{order_id}/g, order.id);

        const whatsapp_mode = (webhookConfig?.metadata as any)?.whatsapp_mode || "api";
        const webhook_id = webhookConfig?.id || "0c578c9d-4e33-48be-91dd-63f98d7ff430";
        const token = webhookConfig?.secret_token || "qnf3vbusrbs105v96afj2r8";

        log("Sending WhatsApp message", { mode: whatsapp_mode, phone: cleanPhone });

        if (whatsapp_mode === "qrcode" || whatsapp_mode === "api") {
          // Enviar via QR Code ou API (sempre usando sendTest do wpp-bot-admin para centralizar a fila)
          const botResp = await fetch(`${supabaseUrl}/functions/v1/wpp-bot-admin`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
            },
            body: JSON.stringify({
              action: "sendTest",
              phone: cleanPhone,
              message_template: messageText,
              lead_name: order.username,
              lead_id: order.id
            })
          });
          const botResult = await botResp.json().catch(() => ({}));
          log("WPP Bot response", botResult);
          
          if (botResult.success || botResult.duplicate) {
            await supabase.from("mro_orders").update({ whatsapp_sent: true }).eq("id", order.id);
          }
        } else {
          // Enviar via API (crm-webhook)
          const crmResp = await fetch(`${supabaseUrl}/functions/v1/crm-webhook`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
            },
            body: JSON.stringify({
              webhook_id,
              token,
              to: cleanPhone,
              message: messageText,
              order_id: order.id
            })
          });
          
          const crmResult = await crmResp.json().catch(() => ({}));
          log("CRM Webhook response", crmResult);

          if (crmResult.success || crmResult.duplicate) {
            await supabase.from("mro_orders").update({ whatsapp_sent: true }).eq("id", order.id);
          }
        }
      }
    } catch (crmError) {
      log("Error calling CRM Webhook", { error: String(crmError) });
    }

    // Verificar se é venda de afiliado e enviar email de comissão
    if (emailParts.length >= 2) {
      const affiliateId = emailParts[0].toLowerCase();
      
      log("Affiliate sale detected", { affiliateId, customerEmail });
      
      // Enviar notificação de comissão para o afiliado
      try {
        if (supabaseUrl) {
          await fetch(`${supabaseUrl}/functions/v1/affiliate-commission-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              type: "commission",
              affiliateId: affiliateId,
              customerEmail: customerEmail,
              customerName: order.username,
              commission: "97",
              orderId: order.id,
              orderNsu: order.nsu_order
            }),
          });
          log("Affiliate commission email request sent");
        }
      } catch (emailError) {
        log("Error sending affiliate commission email", { error: String(emailError) });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "completed",
        order_id: order.id,
        api_created: apiResult.success,
        api_already_exists: apiResult.alreadyExists,
        api_message: apiResult.message,
        email_sent: emailSent,
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
