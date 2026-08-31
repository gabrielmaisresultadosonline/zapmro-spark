import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [METODO-SEGUIDOR-VERIFY] ${step}`, details ? JSON.stringify(details) : "");
};

// Send email via SMTP
async function sendAccessEmail(
  email: string,
  username: string,
  instagramLink: string | null
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

    const instagramSection = instagramLink ? `
      <p style="color: #9ca3af; margin: 8px 0;">
        <strong style="color: #f59e0b;">Perfil do Instagram:</strong> <a href="${instagramLink}" style="color: #60a5fa;">${instagramLink}</a>
      </p>
    ` : '';

    await client.send({
      from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: email,
      subject: "🎉 Seu acesso ao Método de Correção MRO está pronto!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; padding: 40px; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #f59e0b; margin: 0;">🎉 Parabéns!</h1>
            <p style="color: #9ca3af; margin-top: 10px;">Seu acesso foi liberado com sucesso</p>
          </div>
          
          <div style="background-color: #1f2937; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h2 style="color: #ffffff; margin-top: 0;">Seus dados de acesso:</h2>
            <p style="color: #9ca3af; margin: 8px 0;">
              <strong style="color: #f59e0b;">Usuário:</strong> ${username}
            </p>
            <p style="color: #9ca3af; margin: 8px 0;">
              <strong style="color: #f59e0b;">Senha:</strong> ${username}
            </p>
            ${instagramSection}
          </div>

          <div style="background-color: #064e3b; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #10b981; margin: 0; font-weight: bold;">
              🔧 Agora vamos corrigir o perfil do seu Instagram com os métodos da MRO e deixar tudo profissional!
            </p>
          </div>
          
          <div style="text-align: center;">
            <a href="https://maisresultadosonline.com.br/metodoseguidormembro" 
               style="display: inline-block; background-color: #f59e0b; color: #000000; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Acessar Área de Membros
            </a>
          </div>
          
          <p style="color: #6b7280; text-align: center; margin-top: 30px; font-size: 14px;">
            Guarde este email com seus dados de acesso.
          </p>
          
          <hr style="border-color: #333; margin: 30px 0;">
          <p style="color: #6b7280; text-align: center; font-size: 12px;">
            MRO - Mais Resultados Online<br>
            Este é um email automático, não responda.
          </p>
        </div>
      `,
    });

    await client.close();
    log("Email sent successfully", { to: email });
    return true;
  } catch (error) {
    log("Error sending email", error);
    return false;
  }
}

const INFINITEPAY_HANDLE = "paguemro";

// Confirma pagamento pela API oficial (payment_check) usando parâmetros do redirect/webhook
async function checkInfinitePayPaymentCheck(args: {
  order_nsu?: string;
  transaction_nsu?: string;
  slug?: string;
  handle?: string;
}): Promise<boolean> {
  try {
    const handle = args.handle || INFINITEPAY_HANDLE;
    const order_nsu = args.order_nsu;
    const transaction_nsu = args.transaction_nsu;
    const slug = args.slug;

    if (!order_nsu || !transaction_nsu || !slug) {
      log("Payment check skipped (missing params)", { order_nsu: !!order_nsu, transaction_nsu: !!transaction_nsu, slug: !!slug });
      return false;
    }

    log("Calling InfinitePay payment_check", { handle, order_nsu });

    const response = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/payment_check",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ handle, order_nsu, transaction_nsu, slug }),
      }
    );

    const data = await response.json().catch(() => ({}));
    log("InfinitePay payment_check response", { status: response.status, data });

    if (!response.ok) return false;

    return data?.paid === true;
  } catch (error) {
    log("Error checking InfinitePay payment_check", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { nsu_order, order_nsu, email, order_id, transaction_nsu, slug } = body;
    const effectiveOrderNsu = order_nsu || nsu_order;

    log("Verifying payment", { nsu_order: effectiveOrderNsu, email, order_id });

    // Find order
    let order: any = null;

    if (order_id) {
      const { data } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .eq("id", order_id)
        .maybeSingle();
      order = data;
    } else if (effectiveOrderNsu) {
      const { data } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .eq("nsu_order", effectiveOrderNsu)
        .maybeSingle();
      order = data;
    } else if (email) {
      const { data } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .eq("email", email.toLowerCase().trim())
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      order = data;
    }

    if (!order) {
      return new Response(
        JSON.stringify({ error: "Order not found", success: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if already paid
    // IMPORTANT: still ensure user access + email, because older flows could mark order as paid
    // without processing user activation/email.
    if (order.status === "paid") {
      log("Order already marked as paid - ensuring access", { order_id: order.id });
      return await processPayment(supabase, order);
    }

    // Check if expired (15 minutes)
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const fifteenMinutesMs = 15 * 60 * 1000;
    const isExpired = (now.getTime() - createdAt.getTime()) > fifteenMinutesMs;

    if (isExpired && order.status === "pending") {
      log("Order expired", { order_id: order.id, created_at: order.created_at });
      
      await supabase
        .from("metodo_seguidor_orders")
        .update({ 
          status: "expired",
          expired_at: now.toISOString()
        })
        .eq("id", order.id);

      // Also update user status if exists
      if (order.user_id) {
        await supabase
          .from("metodo_seguidor_users")
          .update({ subscription_status: "expired" })
          .eq("id", order.user_id);
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          expired: true,
          message: "Tempo para pagamento expirado (15 minutos)"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (order.status === "expired") {
      return new Response(
        JSON.stringify({ success: false, expired: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Confirmação oficial: quando o cliente volta do checkout, vem order_nsu + slug + transaction_nsu
    const paidByRedirectCheck = await checkInfinitePayPaymentCheck({
      order_nsu: effectiveOrderNsu || order.nsu_order,
      transaction_nsu,
      slug,
    });

    if (paidByRedirectCheck) {
      log("Payment confirmed via InfinitePay payment_check", { order_id: order.id });
      return await processPayment(supabase, order);
    }

    // Update last verification time
    await supabase
      .from("metodo_seguidor_orders")
      .update({ updated_at: now.toISOString() })
      .eq("id", order.id);

    // Calculate time remaining
    const timeElapsed = now.getTime() - createdAt.getTime();
    const timeRemaining = Math.max(0, fifteenMinutesMs - timeElapsed);
    const minutesRemaining = Math.ceil(timeRemaining / 60000);

    return new Response(
      JSON.stringify({ 
        success: true, 
        paid: false,
        time_remaining_minutes: minutesRemaining,
        last_check: now.toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

async function processPayment(supabase: any, order: any) {
  log("Processing payment", { order_id: order.id });

  const nowIso = new Date().toISOString();

  // Update order (idempotent)
  await supabase
    .from("metodo_seguidor_orders")
    .update({
      status: "paid",
      paid_at: order.paid_at || nowIso,
      verified_at: nowIso,
    })
    .eq("id", order.id);

  // Get and update user
  if (order.user_id) {
    const { data: user } = await supabase
      .from("metodo_seguidor_users")
      .select("*")
      .eq("id", order.user_id)
      .maybeSingle();

    if (user) {
      await supabase
        .from("metodo_seguidor_users")
        .update({
          subscription_status: "active",
          subscription_start: user.subscription_start || nowIso,
        })
        .eq("id", user.id);

      // Send email if not already sent
      if (!user.email_sent) {
        const emailSent = await sendAccessEmail(order.email, user.username, user.instagram_username);

        if (emailSent) {
          await supabase
            .from("metodo_seguidor_users")
            .update({
              email_sent: true,
              email_sent_at: nowIso,
            })
            .eq("id", user.id);
        }
      }
    }
  }

  log("Payment verified successfully", { order_id: order.id });

  return new Response(
    JSON.stringify({ success: true, paid: true }),
    { headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }
  );
}
