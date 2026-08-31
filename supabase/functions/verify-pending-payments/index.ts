import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const EXPIRATION_MINUTES = 15;

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [VERIFY-PENDING-PAYMENTS] ${step}${detailsStr}`);
};

// Verificar pagamento via API InfiniPay usando order_nsu
async function checkPaymentByOrderNsu(orderNsu: string): Promise<{ paid: boolean; data?: any }> {
  try {
    const response = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/payment_check",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: INFINITEPAY_HANDLE,
          order_nsu: orderNsu,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return { paid: data.paid === true, data };
    }
    return { paid: false };
  } catch (error) {
    log("Error checking payment by order_nsu", { orderNsu, error: String(error) });
    return { paid: false };
  }
}

// Extrair email real (afiliados usam formato "affiliateId:realEmail")
function extractRealEmail(email: string): { realEmail: string; affiliateId?: string } {
  if (email.includes(':')) {
    const parts = email.split(':');
    return { 
      affiliateId: parts[0], 
      realEmail: parts.slice(1).join(':') // suporta emails com : no meio
    };
  }
  return { realEmail: email };
}

// Verificar pagamento via API InfiniPay usando email no nome do produto
async function checkPaymentByProductEmail(email: string, productPrefix: string): Promise<{ paid: boolean; data?: any }> {
  try {
    // Extrair email real (afiliados usam formato "affiliateId:realEmail")
    const { realEmail, affiliateId } = extractRealEmail(email);
    
    // O nome do produto segue o padrão: PREFIX_email (ex: MROIG_teste@email.com, ZAPMRO_teste@email.com)
    const productName = `${productPrefix}_${realEmail}`;
    
    log("Checking payment by product name", { productName, originalEmail: email, realEmail, affiliateId });
    
    const response = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/payment_check",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: INFINITEPAY_HANDLE,
          product_name: productName,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      log("Payment check by product response", { productName, paid: data.paid, affiliateId });
      return { paid: data.paid === true, data };
    }
    return { paid: false };
  } catch (error) {
    log("Error checking payment by product", { email, productPrefix, error: String(error) });
    return { paid: false };
  }
}

// Verificar pagamento - tenta primeiro por order_nsu, depois pelo email no nome do produto
async function checkPaymentStatus(orderNsu: string, email?: string, productPrefix?: string): Promise<{ paid: boolean; data?: any }> {
  // Primeiro tenta pelo order_nsu
  const resultByNsu = await checkPaymentByOrderNsu(orderNsu);
  if (resultByNsu.paid) {
    log("Payment confirmed via order_nsu", { orderNsu });
    return resultByNsu;
  }

  // Se não encontrou e tem email, tenta pelo nome do produto (email real, sem prefixo de afiliado)
  if (email && productPrefix) {
    const { realEmail, affiliateId } = extractRealEmail(email);
    log("Trying fallback - check by product email", { realEmail, affiliateId, productPrefix });
    const resultByEmail = await checkPaymentByProductEmail(email, productPrefix);
    if (resultByEmail.paid) {
      log("Payment confirmed via product email", { realEmail, affiliateId, productPrefix });
      return resultByEmail;
    }
  }

  return { paid: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Starting pending payments verification");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const now = new Date();
    const expirationThreshold = new Date(now.getTime() - EXPIRATION_MINUTES * 60 * 1000);

    // Buscar todos os pedidos pendentes de todas as tabelas de orders
    const tables = [
      { name: "mro_orders", nsuField: "nsu_order" },
      { name: "zapmro_orders", nsuField: "nsu_order" },
      { name: "corretor_orders", nsuField: "nsu_order" },
      { name: "payment_orders", nsuField: "nsu_order" },
      { name: "metodo_seguidor_orders", nsuField: "nsu_order" },
      { name: "ads_orders", nsuField: "nsu_order" },
    ];

    const results = {
      verified: 0,
      paid: 0,
      expired: 0,
      errors: 0,
    };

    for (const table of tables) {
      log(`Processing table: ${table.name}`);

      // Buscar pedidos pendentes
      const { data: pendingOrders, error: fetchError } = await supabase
        .from(table.name)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50);

      if (fetchError) {
        log(`Error fetching from ${table.name}`, fetchError);
        results.errors++;
        continue;
      }

      if (!pendingOrders || pendingOrders.length === 0) {
        log(`No pending orders in ${table.name}`);
        continue;
      }

      log(`Found ${pendingOrders.length} pending orders in ${table.name}`);

      for (const order of pendingOrders) {
        const orderNsu = order[table.nsuField];
        const createdAt = new Date(order.created_at);
        const isExpired = createdAt < expirationThreshold;

        results.verified++;

        // Determinar o prefixo do produto baseado na tabela
        let productPrefix: string | undefined;
        if (table.name === "mro_orders") productPrefix = "MROIG";
        else if (table.name === "zapmro_orders") productPrefix = "ZAPMRO";
        else if (table.name === "corretor_orders") productPrefix = "CORRETOR";
        else if (table.name === "metodo_seguidor_orders") productPrefix = "MTSEG";
        else if (table.name === "ads_orders") productPrefix = "ADS";

        // Verificar pagamento na InfiniPay (por order_nsu e fallback por email no produto)
        const { paid, data: paymentData } = await checkPaymentStatus(orderNsu, order.email, productPrefix);

        if (paid) {
          log(`Payment CONFIRMED for ${orderNsu}`, { table: table.name, orderId: order.id, email: order.email });

          // Marcar como pago
          const { error: updateError } = await supabase
            .from(table.name)
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          if (updateError) {
            log(`Error updating order to paid`, { orderId: order.id, error: updateError });
            results.errors++;
          } else {
            results.paid++;

            // Disparar webhook de processamento para MRO orders
            if (table.name === "mro_orders") {
              try {
                await supabase.functions.invoke("mro-payment-webhook", {
                  body: {
                    order_nsu: orderNsu,
                    items: [{
                      description: `MROIG_${order.plan_type === "lifetime" ? "VITALICIO" : "ANUAL"}_${order.username}_${order.email}`
                    }]
                  }
                });
                log(`MRO webhook triggered for ${orderNsu}`);
              } catch (e) {
                log(`Error triggering MRO webhook`, { error: String(e) });
              }
            }

            // Disparar webhook para ZAPMRO orders
            if (table.name === "zapmro_orders") {
              try {
                await supabase.functions.invoke("zapmro-payment-webhook", {
                  body: {
                    order_nsu: orderNsu,
                    items: [{
                      description: `ZAPMRO_${order.plan_type === "lifetime" ? "VITALICIO" : "ANUAL"}_${order.username}_${order.email}`
                    }]
                  }
                });
                log(`ZAPMRO webhook triggered for ${orderNsu}`);
              } catch (e) {
                log(`Error triggering ZAPMRO webhook`, { error: String(e) });
              }
            }

            // Disparar webhook para Corretor orders
            if (table.name === "corretor_orders") {
              try {
                await supabase.functions.invoke("corretor-webhook", {
                  body: {
                    order_nsu: orderNsu,
                    email: order.email,
                    name: order.name
                  }
                });
                log(`Corretor webhook triggered for ${orderNsu}`);
              } catch (e) {
                log(`Error triggering Corretor webhook`, { error: String(e) });
              }
            }
          }
        } else if (isExpired) {
          log(`Order EXPIRED for ${orderNsu}`, { table: table.name, orderId: order.id, createdAt: order.created_at });

          // Marcar como expirado
          const { error: expireError } = await supabase
            .from(table.name)
            .update({
              status: "expired",
              expired_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          if (expireError) {
            log(`Error expiring order`, { orderId: order.id, error: expireError });
            results.errors++;
          } else {
            results.expired++;
          }
        } else {
          log(`Order still pending: ${orderNsu}`, { 
            table: table.name, 
            orderId: order.id,
            age: Math.round((now.getTime() - createdAt.getTime()) / 60000) + " min"
          });
        }

        // Delay para não sobrecarregar a API
        await new Promise(r => setTimeout(r, 200));
      }
    }

    log("Verification complete", results);

    // Trigger scheduled CRM messages processing
    try {
      await supabase.functions.invoke('meta-whatsapp-crm', { body: { action: 'processScheduled' } });
      log("Scheduled CRM messages processed");
    } catch (e) {
      log("Error triggering scheduled CRM messages", { error: String(e) });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Pending payments verification complete",
        results,
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });

    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
