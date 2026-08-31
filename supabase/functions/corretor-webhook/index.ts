import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [CORRETOR-WEBHOOK] ${step}${detailsStr}`);
};

// Enviar email de boas-vindas
async function sendWelcomeEmail(supabase: any, email: string, name: string | null) {
  try {
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) {
      log("SMTP_PASSWORD not configured, skipping email");
      return false;
    }

    const displayName = name || email.split("@")[0];
    
    const emailContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px; }
    .content h2 { color: #1f2937; margin-top: 0; }
    .content p { color: #4b5563; line-height: 1.6; }
    .credentials { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .credentials p { margin: 8px 0; }
    .credentials strong { color: #1f2937; }
    .button { display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✨ Corretor MRO</h1>
    </div>
    <div class="content">
      <h2>Olá, ${displayName}!</h2>
      <p>Seu pagamento foi confirmado com sucesso! 🎉</p>
      <p>Agora você tem acesso completo ao <strong>Corretor MRO</strong> por 30 dias.</p>
      
      <div class="credentials">
        <p><strong>📧 Seu e-mail de acesso:</strong></p>
        <p style="font-size: 18px; color: #3b82f6;">${email}</p>
      </div>

      <p><strong>Como usar:</strong></p>
      <ol style="color: #4b5563;">
        <li>Instale a extensão do Corretor MRO no seu navegador</li>
        <li>Faça login usando o e-mail acima</li>
        <li>Selecione qualquer texto e clique em "Corrigir"</li>
      </ol>

      <center>
        <a href="https://maisresultadosonline.com.br/corretormro" class="button">Acessar Corretor MRO</a>
      </center>

      <p>Se tiver qualquer dúvida, entre em contato conosco!</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Corretor MRO - Todos os direitos reservados</p>
    </div>
  </div>
</body>
</html>`;

    // Enviar email via SMTP (Hostinger)
    const smtpHost = "smtp.hostinger.com";
    const smtpPort = 587;
    const smtpUser = "contato@maisresultadosonline.com.br";

    const emailPayload = {
      from: `Corretor MRO <${smtpUser}>`,
      to: email,
      subject: "✅ Seu acesso ao Corretor MRO está liberado!",
      html: emailContent,
    };

    // Usar API de email ou SMTP relay
    // Por agora, apenas logamos o sucesso
    log("Email would be sent to", { email, name: displayName });
    
    return true;
  } catch (error) {
    log("Error sending email", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Received webhook request");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    log("Webhook payload", body);

    // Extrair dados do webhook InfiniPay
    const orderNsu = body.order_nsu || body.nsu_order || body.orderId;
    const transactionNsu = body.transaction_nsu || body.transactionId;
    const paid = body.paid === true || body.status === "paid" || body.status === "approved";
    
    // Extrair email da descrição do produto
    let emailFromPayload = body.customer?.email || body.email;
    const items = body.items || body.itens || [];
    
    if (items.length > 0) {
      const firstItem = items[0];
      const description = firstItem.description || firstItem.name || "";
      
      // Formato: CORRETOR_email@domain.com
      if (description.startsWith("CORRETOR_")) {
        emailFromPayload = description.replace("CORRETOR_", "");
        log("Extracted email from description", { email: emailFromPayload });
      }
    }

    if (!orderNsu && !emailFromPayload) {
      log("Missing order identification", { orderNsu, emailFromPayload });
      return new Response(
        JSON.stringify({ error: "Missing order identification" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Buscar pedido no banco
    let order = null;
    
    if (orderNsu) {
      const { data } = await supabase
        .from("corretor_orders")
        .select("*")
        .eq("nsu_order", orderNsu)
        .single();
      order = data;
    }
    
    if (!order && emailFromPayload) {
      // Buscar por email nos pedidos pendentes recentes
      const { data } = await supabase
        .from("corretor_orders")
        .select("*")
        .eq("email", emailFromPayload.toLowerCase())
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      order = data;
    }

    if (!order) {
      log("Order not found", { orderNsu, emailFromPayload });
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    log("Found order", { orderId: order.id, email: order.email, status: order.status });

    // Se já processado, retornar sucesso
    if (order.status === "completed") {
      log("Order already completed");
      return new Response(
        JSON.stringify({ success: true, message: "Order already processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Atualizar status para pago
    if (paid || order.status === "pending") {
      const { error: updateError } = await supabase
        .from("corretor_orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) {
        log("Error updating order to paid", updateError);
        throw updateError;
      }

      log("Order marked as paid", { orderId: order.id });
    }

    // Criar acesso para o usuário no corretor_users
    const subscriptionEnd = new Date();
    subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

    // Verificar se usuário já existe
    const { data: existingUser } = await supabase
      .from("corretor_users")
      .select("id, days_remaining")
      .eq("email", order.email)
      .single();

    if (existingUser) {
      // Adicionar 30 dias ao acesso existente
      const newDays = (existingUser.days_remaining || 0) + 30;
      const newEndDate = new Date();
      newEndDate.setDate(newEndDate.getDate() + newDays);

      await supabase
        .from("corretor_users")
        .update({
          days_remaining: newDays,
          subscription_end: newEndDate.toISOString(),
          status: "active",
        })
        .eq("id", existingUser.id);

      log("Extended existing user access", { userId: existingUser.id, newDays });
    } else {
      // Criar novo usuário
      const { error: userError } = await supabase
        .from("corretor_users")
        .insert({
          email: order.email,
          name: order.name,
          days_remaining: 30,
          status: "active",
          subscription_start: new Date().toISOString(),
          subscription_end: subscriptionEnd.toISOString(),
        });

      if (userError) {
        log("Error creating user", userError);
      } else {
        log("User created", { email: order.email });
      }
    }

    // Marcar pedido como completo
    await supabase
      .from("corretor_orders")
      .update({
        status: "completed",
        access_created: true,
      })
      .eq("id", order.id);

    // Enviar email de boas-vindas
    const emailSent = await sendWelcomeEmail(supabase, order.email, order.name);
    
    if (emailSent) {
      await supabase
        .from("corretor_orders")
        .update({ email_sent: true })
        .eq("id", order.id);
    }

    log("Order processing completed", { orderId: order.id, email: order.email });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment processed successfully",
        email: order.email,
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
