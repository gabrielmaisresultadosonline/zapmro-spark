import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { verifyInfinitePayWebhook } from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [METODO-SEGUIDOR-WEBHOOK] ${step}`, details ? JSON.stringify(details) : "");
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

// Extract email from product description (MTSEG_email format)
function extractEmailFromDescription(description: string): string | null {
  if (!description) return null;
  
  // Try MTSEG_email format
  if (description.startsWith("MTSEG_")) {
    const email = description.replace("MTSEG_", "");
    if (email.includes("@")) {
      return email.toLowerCase().trim();
    }
  }
  
  // Try to find email pattern
  const emailMatch = description.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    return emailMatch[0].toLowerCase().trim();
  }
  
  return null;
}

const INFINITEPAY_HANDLE = "paguemro";

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
      log("Payment check skipped (missing params)", {
        order_nsu: !!order_nsu,
        transaction_nsu: !!transaction_nsu,
        slug: !!slug,
      });
      return false;
    }

    log("Calling InfinitePay payment_check", { handle, order_nsu });

    const response = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/payment_check",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
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
    log("Webhook received");

    // Verify webhook signature for security
    const verification = await verifyInfinitePayWebhook(req, corsHeaders, "METODO-SEGUIDOR-WEBHOOK");
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

    const body = verification.body;
    log("Webhook body", body);

    // Extract payment info from webhook with proper typing
    const metadata = body.metadata as Record<string, unknown> | undefined;
    const orderNsu = (body.order_nsu || body.orderNsu || body.nsu || metadata?.order_nsu) as string | undefined;
    const paymentStatus = (body.status || body.payment_status) as string | undefined;
    const invoiceSlug = (body.invoice_slug || body.slug || body.invoiceSlug) as string | undefined;
    const transactionNsu = (body.transaction_nsu || body.transactionNsu) as string | undefined;

    // Candidate: InfinitePay envia webhook quando o pagamento é aprovado; alguns payloads não trazem "status"
    const paidCandidate =
      body.paid === true ||
      paymentStatus === "paid" ||
      paymentStatus === "approved" ||
      (!!invoiceSlug && !!transactionNsu);

    // Try to get email from items/description
    let emailFromDescription: string | null = null;

    const items = body.items as Array<{ description?: string; name?: string }> | undefined;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const desc = item.description || item.name;
        if (desc && desc.includes("MTSEG_")) {
          emailFromDescription = extractEmailFromDescription(desc);
          if (emailFromDescription) {
            log("Found email in item description", { email: emailFromDescription });
            break;
          }
        }
      }
    }

    // Also check body.description directly
    if (!emailFromDescription && body.description) {
      emailFromDescription = extractEmailFromDescription(body.description as string);
    }

    // Also check customer email
    const customer = body.customer as Record<string, unknown> | undefined;
    const customerEmail = (customer?.email || body.email) as string | undefined;

    log("Payment info extracted", {
      orderNsu,
      paymentStatus,
      invoiceSlug,
      transactionNsu: !!transactionNsu,
      paidCandidate,
      emailFromDescription,
      customerEmail,
    });

    if (!paidCandidate) {
      log("Payment not approved (candidate=false)", { status: paymentStatus });
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirmar oficialmente pela API pública (evita falsos positivos em endpoint público)
    const paidConfirmed = await checkInfinitePayPaymentCheck({
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug: invoiceSlug,
    });

    if (!paidConfirmed) {
      log("Payment not confirmed by payment_check", { orderNsu, invoiceSlug, hasTransaction: !!transactionNsu });
      return new Response(JSON.stringify({ received: true, confirmed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find order by NSU or by email
    let order: any = null;

    if (orderNsu) {
      const { data } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .eq("nsu_order", orderNsu)
        .maybeSingle();
      order = data;
    }

    // If not found by NSU, try by email from description
    if (!order && emailFromDescription) {
      const { data } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .eq("email", emailFromDescription)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      order = data;
    }

    // If still not found, try by customer email
    if (!order && customerEmail) {
      const { data } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .eq("email", customerEmail.toLowerCase().trim())
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      order = data;
    }

    if (!order) {
      log("Order not found", { orderNsu, emailFromDescription, customerEmail });
      return new Response(JSON.stringify({ error: "Order not found", received: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404 
      });
    }

    if (order.status === "paid") {
      log("Order already paid - ensuring user access/email", { order_id: order.id });
      // continue to ensure user is active + email sent (idempotent)
    }

    // Update order status (idempotent)
    const nowIso = new Date().toISOString();
    const { error: updateOrderError } = await supabase
      .from("metodo_seguidor_orders")
      .update({
        status: "paid",
        paid_at: order.paid_at || nowIso,
        verified_at: nowIso,
      })
      .eq("id", order.id);

    if (updateOrderError) {
      log("Error updating order", updateOrderError);
    }

    // Get user and update status
    if (order.user_id) {
      const { data: user, error: userError } = await supabase
        .from("metodo_seguidor_users")
        .select("*")
        .eq("id", order.user_id)
        .maybeSingle();

      if (user) {
        const { error: updateUserError } = await supabase
          .from("metodo_seguidor_users")
          .update({
            subscription_status: "active",
            subscription_start: new Date().toISOString()
          })
          .eq("id", user.id);

        if (updateUserError) {
          log("Error updating user", updateUserError);
        }

        // Send email with credentials via SMTP
        // username is both login and password, instagram_username contains the link
        if (!user.email_sent) {
          const emailSent = await sendAccessEmail(
            order.email, 
            user.username, 
            user.instagram_username
          );

          if (emailSent) {
            await supabase
              .from("metodo_seguidor_users")
              .update({
                email_sent: true,
                email_sent_at: new Date().toISOString()
              })
              .eq("id", user.id);
          }
        }
      }
    }

    log("Payment processed successfully", { order_id: order.id, orderNsu });

    return new Response(
      JSON.stringify({ success: true }),
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
