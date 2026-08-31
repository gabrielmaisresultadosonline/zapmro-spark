import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { verifyInfinitePayWebhook } from "../_shared/webhook-security.ts";
import { sendRendaExtEmail } from "../_shared/rendaext-emails.ts";
import { sendCrmSalesApprovedEmail } from "../_shared/zapmro-sales-email.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const META_PIXEL_ID = '569414052132145';
const META_API_VERSION = 'v18.0';

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [INFINITEPAY-WEBHOOK] ${step}${detailsStr}`);
};

// Send Purchase event to Meta Conversions API
async function sendMetaPurchaseEvent(email: string, value: number, contentName: string, sourceUrl: string = 'https://maisresultadosonline.com.br/mroobrigado') {
  try {
    const accessToken = Deno.env.get('META_CONVERSIONS_API_TOKEN');
    if (!accessToken) {
      log("META: No access token configured, skipping Purchase event");
      return;
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(email.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedEmail = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const event = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: sourceUrl,
      user_data: { em: hashedEmail },
      custom_data: {
        content_name: contentName,
        value: value,
        currency: 'BRL',
      },
    };

    const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events`;
    const resp = await fetch(metaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event], access_token: accessToken }),
    });

    const result = await resp.json();
    log("META Purchase event sent", { email, value, contentName, success: resp.ok, result });
  } catch (err) {
    log("META Purchase event error (non-blocking)", { error: String(err) });
  }
}

// Função para verificar pagamento via API da InfiniPay
async function verifyPaymentWithAPI(orderNsu: string, transactionNsu?: string, slug?: string): Promise<{ paid: boolean; data?: any }> {
  try {
    log("Verifying payment via InfiniPay API", { orderNsu, transactionNsu, slug });
    
    const response = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/payment_check",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: INFINITEPAY_HANDLE,
          order_nsu: orderNsu,
          ...(transactionNsu && { transaction_nsu: transactionNsu }),
          ...(slug && { slug: slug }),
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      log("InfiniPay API response", data);
      return { paid: data.paid === true, data };
    } else {
      log("InfiniPay API error", { status: response.status });
      return { paid: false };
    }
  } catch (error) {
    log("Error calling InfiniPay API", { error: String(error) });
    return { paid: false };
  }
}

// Função para salvar log do webhook
async function saveWebhookLog(
  supabase: any,
  logData: {
    event_type: string;
    order_nsu?: string | null;
    transaction_nsu?: string | null;
    email?: string | null;
    username?: string | null;
    affiliate_id?: string | null;
    amount?: number | null;
    status: string;
    payload?: any;
    result_message?: string | null;
    order_found?: boolean;
    order_id?: string | null;
  }
) {
  try {
    await supabase.from("infinitepay_webhook_logs").insert({
      event_type: logData.event_type,
      order_nsu: logData.order_nsu || null,
      transaction_nsu: logData.transaction_nsu || null,
      email: logData.email || null,
      username: logData.username || null,
      affiliate_id: logData.affiliate_id || null,
      amount: logData.amount || null,
      status: logData.status,
      payload: logData.payload || null,
      result_message: logData.result_message || null,
      order_found: logData.order_found || false,
      order_id: logData.order_id || null,
    });
    log("Webhook log saved");
  } catch (e) {
    log("Error saving webhook log", { error: String(e) });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Webhook received", { method: req.method });

    // Verify webhook signature for security
    const verification = await verifyInfinitePayWebhook(req, corsHeaders, "INFINITEPAY-WEBHOOK");
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
    log("Webhook payload", body);

    const order_nsu = body.order_nsu as string | undefined;
    const transaction_nsu = body.transaction_nsu as string | undefined;
    const invoice_slug = body.invoice_slug as string | undefined;
    const amount = body.amount as number | undefined;
    const paid_amount = body.paid_amount as number | undefined;
    const capture_method = body.capture_method as string | undefined;
    const receipt_url = body.receipt_url as string | undefined;
    const items = body.items as Array<{ description?: string; name?: string }> | undefined;

    let email: string | null = null;
    let emailWithAffiliate: string | null = null;
    let username: string | null = null;
    let affiliateId: string | null = null;
    let isMROOrder = false;
    let isPromptsOrder = false;
    let isRendaExtOrder = false;
    let isCrmSalesOrder = false;
    
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const itemName = item.description || item.name || "";
        log("Processing item", { itemName });
        
        if (itemName.startsWith("CRMSALES_")) {
          isCrmSalesOrder = true;
          // CRMSALES_<plan>_<email>
          const parts = itemName.split("_");
          if (parts.length >= 3) {
            email = parts.slice(2).join("_").toLowerCase();
          }
          log("Parsed CRMSALES order", { email, order_nsu });
          break;
        }

        if (itemName.startsWith("RENDAEXT_")) {
          isRendaExtOrder = true;
          email = itemName.replace("RENDAEXT_", "").toLowerCase();
          log("Parsed RENDAEXT order", { email });
          break;
        }

        if (itemName.startsWith("PROMPTS_")) {
          isPromptsOrder = true;
          email = itemName.replace("PROMPTS_", "").toLowerCase();
          log("Parsed PROMPTS order", { email });
          break;
        }
        
        if (itemName.startsWith("MROIG_")) {
          isMROOrder = true;
          const parts = itemName.split("_");
          if (parts.length >= 4) {
            username = parts[2];
            emailWithAffiliate = parts.slice(3).join("_").toLowerCase();
            
            if (emailWithAffiliate && emailWithAffiliate.includes(":") && emailWithAffiliate.includes("@")) {
              const colonIndex = emailWithAffiliate.indexOf(":");
              const potentialAffiliate = emailWithAffiliate.substring(0, colonIndex);
              const potentialEmail = emailWithAffiliate.substring(colonIndex + 1);
              
              if (potentialEmail.includes("@")) {
                affiliateId = potentialAffiliate;
                email = potentialEmail;
                log("Detected affiliate sale", { affiliateId, realEmail: email });
              } else {
                email = emailWithAffiliate;
              }
            } else if (emailWithAffiliate) {
              email = emailWithAffiliate;
            }
          }
          log("Parsed MRO order", { username, email, emailWithAffiliate, affiliateId });
          break;
        }
        else if (itemName.startsWith("MRO_")) {
          email = itemName.replace("MRO_", "").toLowerCase();
          emailWithAffiliate = email;
          break;
        }
      }
    }

    log("Parsed webhook data", { 
      order_nsu, 
      transaction_nsu, 
      email, 
      isRendaExtOrder,
      isPromptsOrder,
      isMROOrder,
      isCrmSalesOrder,
      amount, 
      paid_amount
    });

    // CRM SALES orders (from /vendas PurchaseDialog)
    if (isCrmSalesOrder || (order_nsu && typeof order_nsu === "string" && order_nsu.startsWith("CRM"))) {
      log("Processing as CRMSALES order", { order_nsu, email });
      let crmOrder = null as any;
      if (order_nsu) {
        const r = await supabase
          .from("crm_sales_orders").select("*")
          .eq("nsu_order", order_nsu).eq("status", "pending").maybeSingle();
        crmOrder = r.data;
      }
      if (!crmOrder && email) {
        const r = await supabase
          .from("crm_sales_orders").select("*")
          .eq("email", email).eq("status", "pending")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        crmOrder = r.data;
      }
      if (crmOrder) {
        await supabase.from("crm_sales_orders").update({
          status: "approved",
          paid_at: new Date().toISOString(),
          transaction_nsu: transaction_nsu ?? null,
          invoice_slug: invoice_slug ?? null,
          raw_webhook: body,
        }).eq("id", crmOrder.id);
        // Grant CRM access on the profile
        try {
          const planDays: Record<string, number> = { mensal: 30, semestral: 180, anual: 365 };
          const days = planDays[crmOrder.plan] ?? 30;
          await supabase.rpc("grant_crm_access", {
            p_email: crmOrder.email,
            p_plan: crmOrder.plan,
            p_days: days,
          });
        } catch (e) {
          log("CRMSALES grant_crm_access error", { error: String(e) });
        }
        await sendMetaPurchaseEvent(
          crmOrder.email,
          Number(crmOrder.amount) || 0,
          `CRM Vendas ${crmOrder.plan_label || crmOrder.plan}`
        );
        try {
          await sendCrmSalesApprovedEmail({
            to: crmOrder.email,
            fullName: crmOrder.full_name,
            planLabel: crmOrder.plan_label || crmOrder.plan,
            amount: Number(crmOrder.amount) || 0,
          });
          log("CRMSALES welcome email sent", { to: crmOrder.email });
        } catch (e) {
          log("CRMSALES email error", { error: String(e) });
        }
        log("CRMSALES approved", { id: crmOrder.id });
        return new Response(JSON.stringify({ success: true, message: "CRMSALES confirmed" }), { status: 200, headers: corsHeaders });
      }
    }

    // RENDAEXT orders
    if (isRendaExtOrder || (order_nsu && typeof order_nsu === 'string' && order_nsu.startsWith("RENDAEXT"))) {
      log("Processing as RENDAEXT order", { order_nsu, email });
      
      const { data: order } = await supabase
        .from("rendaext_orders")
        .select("*")
        .eq("nsu_order", order_nsu)
        .eq("status", "pending")
        .maybeSingle();

      if (order) {
        // Send email
        const emailSent = await sendRendaExtEmail(order.email, order.nome_completo);

        await supabase.from("rendaext_orders").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          email_sent: emailSent,
          email_sent_at: emailSent ? new Date().toISOString() : null,
        }).eq("id", order.id);

        await sendMetaPurchaseEvent(
          email || order.email,
          order.amount || 19.90,
          "Renda Extra - Aula"
        );

        log("RENDAEXT order confirmed, email sent and tracked", { orderId: order.id, emailSent });
        
        return new Response(JSON.stringify({ success: true, message: "RENDAEXT confirmed" }), { status: 200, headers: corsHeaders });
      }
    }

    // PROMPTS MRO orders
    if (isPromptsOrder || (order_nsu && typeof order_nsu === 'string' && order_nsu.startsWith("PROMPTS"))) {
      log("Processing as PROMPTS order", { order_nsu, email });
      let promptsOrder = null;
      if (order_nsu) {
        const result = await supabase.from("prompts_mro_payment_orders").select("*").eq("nsu_order", order_nsu).eq("status", "pending").maybeSingle();
        promptsOrder = result.data;
      }
      if (!promptsOrder && email) {
        const result = await supabase.from("prompts_mro_payment_orders").select("*").eq("email", email).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
        promptsOrder = result.data;
      }

      if (promptsOrder) {
        await supabase.from("prompts_mro_payment_orders").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", promptsOrder.id);
        const isMonthly = promptsOrder.amount <= 50;
        const planDays = isMonthly ? 30 : 365;
        const planLabel = isMonthly ? 'PRO Mensal (30 dias)' : 'PRO Anual (365 dias)';
        const subscriptionEnd = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();
        if (promptsOrder.user_id) {
          await supabase.from("prompts_mro_users").update({ is_paid: true, paid_at: new Date().toISOString(), subscription_end: subscriptionEnd }).eq("id", promptsOrder.user_id);
        }
        await sendMetaPurchaseEvent(promptsOrder.email, promptsOrder.amount || 47, `Prompts MRO ${planLabel}`);
        return new Response(JSON.stringify({ success: true, message: "PROMPTS Payment confirmed" }), { headers: corsHeaders, status: 200 });
      }
    }

    // MRO order
    if (isMROOrder || (order_nsu && typeof order_nsu === 'string' && order_nsu.startsWith("MROIG"))) {
      log("Processing as MRO order");
      let mroOrder = null;
      if (order_nsu) {
        const result = await supabase.from("mro_orders").select("*").eq("nsu_order", order_nsu).eq("status", "pending").maybeSingle();
        mroOrder = result.data;
      }
      if (mroOrder) {
        await supabase.from("mro_orders").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", mroOrder.id);
        await sendMetaPurchaseEvent(email || mroOrder.email, mroOrder.amount || 300, `MRO ${mroOrder.plan_type === "lifetime" ? "Vitalício" : "Anual"}`);
        try {
          await supabase.functions.invoke("mro-payment-webhook", { body: { order_nsu: mroOrder.nsu_order, items: [{ description: `MROIG_${mroOrder.plan_type === "lifetime" ? "VITALICIO" : "ANUAL"}_${mroOrder.username}_${mroOrder.email}` }] } });
        } catch (e) { log("Error invoking MRO webhook", e); }
        return new Response(JSON.stringify({ success: true, message: "MRO Payment confirmed" }), { headers: corsHeaders, status: 200 });
      }
    }

    // Default payment orders
    let order = null;
    if (order_nsu) {
      const result = await supabase.from("payment_orders").select("*").eq("nsu_order", order_nsu).eq("status", "pending").maybeSingle();
      order = result.data;
    }
    if (order) {
      await supabase.from("payment_orders").update({ status: "paid", paid_at: new Date().toISOString(), verified_at: new Date().toISOString() }).eq("id", order.id);
      await sendMetaPurchaseEvent(order.email, order.amount || 300, 'MRO Payment');
      return new Response(JSON.stringify({ success: true, message: "Payment confirmed" }), { headers: corsHeaders, status: 200 });
    }

    return new Response(JSON.stringify({ success: false, error: "No pending order found" }), { headers: corsHeaders, status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), { headers: corsHeaders, status: 400 });
  }
});
