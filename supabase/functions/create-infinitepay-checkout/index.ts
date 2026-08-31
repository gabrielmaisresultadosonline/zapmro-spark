import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const REDIRECT_URL = "https://maisresultadosonline.com.br/pagamentoobrigado";

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [CREATE-CHECKOUT] ${step}${detailsStr}`);
};

const generateNSU = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `MRO${timestamp}${random}`.toUpperCase();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Creating checkout link");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { email, amount } = body;

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const orderNsu = generateNSU();
    const priceInCents = Math.round((amount || 97) * 100);
    
    // Webhook URL para receber notificação de pagamento
    const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook`;

    log("Preparing InfiniPay request", { 
      email: cleanEmail, 
      orderNsu, 
      priceInCents,
      webhookUrl 
    });

    // Criar link via API do InfiniPay
    // Obs: algumas versões da doc usam "itens"; por compatibilidade enviamos ambos (items/itens).
    const lineItems = [{
      description: `MRO_${cleanEmail}`,
      quantity: 1,
      price: priceInCents,
    }];

    const infinitepayPayload = {
      handle: INFINITEPAY_HANDLE,
      items: lineItems,
      itens: lineItems,
      order_nsu: orderNsu,
      redirect_url: REDIRECT_URL,
      webhook_url: webhookUrl,
      customer: {
        email: cleanEmail,
      },
    };

    log("Calling InfiniPay API", infinitepayPayload);

    const infinitepayResponse = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/links",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(infinitepayPayload),
      }
    );

    const infinitepayData = await infinitepayResponse.json();
    log("InfiniPay response", { status: infinitepayResponse.status, data: infinitepayData });

    if (!infinitepayResponse.ok) {
      log("InfiniPay API error", infinitepayData);
      
      // Fallback: criar link manualmente se a API falhar
      const fallbackItems = JSON.stringify([{
        name: `MRO_${cleanEmail}`,
        price: priceInCents,
        quantity: 1
      }]);
      
      const fallbackLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${encodeURIComponent(fallbackItems)}&redirect_url=${encodeURIComponent(REDIRECT_URL)}`;
      
      // Save order to database with fallback link
      const { data: orderData, error: insertError } = await supabase
        .from("payment_orders")
        .insert({
          email: cleanEmail,
          nsu_order: orderNsu,
          amount: amount || 97,
          status: "pending",
          infinitepay_link: fallbackLink,
        })
        .select()
        .single();

      if (insertError) {
        log("Error saving order", insertError);
        throw insertError;
      }

      log("Order created with fallback link", { orderId: orderData.id });

      return new Response(
        JSON.stringify({
          success: true,
          fallback: true,
          order_id: orderData.id,
          nsu_order: orderNsu,
          payment_link: fallbackLink,
          email: cleanEmail,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Extrair link do checkout da resposta
    const paymentLink = infinitepayData.checkout_url || infinitepayData.link || infinitepayData.url;

    // Save order to database
    const { data: orderData, error: insertError } = await supabase
      .from("payment_orders")
      .insert({
        email: cleanEmail,
        nsu_order: orderNsu,
        amount: amount || 97,
        status: "pending",
        infinitepay_link: paymentLink,
      })
      .select()
      .single();

    if (insertError) {
      log("Error saving order", insertError);
      throw insertError;
    }

    log("Order created successfully", { orderId: orderData.id, paymentLink });

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderData.id,
        nsu_order: orderNsu,
        payment_link: paymentLink,
        email: cleanEmail,
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
