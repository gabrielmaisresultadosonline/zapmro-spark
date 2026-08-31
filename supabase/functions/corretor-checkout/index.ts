import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [CORRETOR-CHECKOUT] ${step}${detailsStr}`);
};

const generateNSU = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `COR${timestamp}${random}`.toUpperCase();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Creating Corretor MRO checkout link");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { email, name, phone } = body;

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name ? name.trim() : "";
    const cleanPhone = phone ? phone.replace(/\D/g, "").trim() : "";
    const orderNsu = generateNSU();
    const priceInCents = 1990; // R$ 19,90
    const amount = 19.90;

    // Redirect URL para página de obrigado
    const redirectUrl = `https://maisresultadosonline.com.br/corretormro/obrigado`;
    
    // Webhook URL para receber notificação automática de pagamento
    const webhookUrl = `${supabaseUrl}/functions/v1/corretor-webhook`;

    log("Preparing InfiniPay API request", { 
      email: cleanEmail, 
      name: cleanName,
      orderNsu, 
      priceInCents,
      webhookUrl
    });

    // Descrição do produto inclui email para identificação
    // Formato: CORRETOR_email
    const productDescription = `CORRETOR_${cleanEmail}`;

    // Criar checkout via API oficial para garantir webhook
    const lineItems = [{
      description: productDescription,
      quantity: 1,
      price: priceInCents,
    }];

    const infinitepayPayload = {
      handle: INFINITEPAY_HANDLE,
      items: lineItems,
      itens: lineItems, // compatibilidade
      order_nsu: orderNsu,
      redirect_url: redirectUrl,
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
    log("InfiniPay API response", { status: infinitepayResponse.status, data: infinitepayData });

    let paymentLink: string;

    if (!infinitepayResponse.ok) {
      log("InfiniPay API error, using fallback link", infinitepayData);
      
      // Fallback: link manual
      const itemData = [{
        name: productDescription,
        price: priceInCents,
        quantity: 1
      }];
      const itemsEncoded = encodeURIComponent(JSON.stringify(itemData));
      paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${itemsEncoded}&redirect_url=${encodeURIComponent(redirectUrl)}&webhook_url=${encodeURIComponent(webhookUrl)}`;
    } else {
      // Extrair link do checkout da resposta
      paymentLink = infinitepayData.checkout_url || infinitepayData.link || infinitepayData.url;
      log("Payment link created via API", { paymentLink, orderNsu });
    }

    // Salvar pedido no banco (expira em 30 minutos)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const { data: orderData, error: insertError } = await supabase
      .from("corretor_orders")
      .insert({
        email: cleanEmail,
        name: cleanName || null,
        phone: cleanPhone || null,
        amount: amount,
        status: "pending",
        nsu_order: orderNsu,
        infinitepay_link: paymentLink,
        expired_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      log("Error saving order", insertError);
      throw insertError;
    }

    log("Order created successfully", { orderId: orderData.id, paymentLink, orderNsu });

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
