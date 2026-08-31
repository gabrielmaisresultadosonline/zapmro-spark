import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const ZAPMRO_API_URL = "https://mrozap.squareweb.app";

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [CREATE-ZAPMRO-CHECKOUT] ${step}${detailsStr}`);
};

const generateNSU = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ZAPMRO${timestamp}${random}`.toUpperCase();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Creating ZAPMRO checkout link");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { email, username, phone, planType, amount, checkUserExists } = body;

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!username || username.length < 4) {
      return new Response(
        JSON.stringify({ error: "Nome de usuário inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.toLowerCase().trim();
    const cleanPhone = phone ? phone.replace(/\D/g, "").trim() : "";
    const orderNsu = generateNSU();
    const priceInCents = Math.round((amount || 397) * 100);

    // Verificar se usuário já existe na API ZAPMRO
    if (checkUserExists) {
      try {
        log("Checking if user exists in ZAPMRO API", { username: cleanUsername });
        const checkResponse = await fetch(`${ZAPMRO_API_URL}/public/api/users/${cleanUsername}`, {
          headers: {
            'Authorization': 'Bearer secreta123',
          },
        });
        
        if (checkResponse.ok) {
          const userData = await checkResponse.json();
          if (userData && userData.username) {
            log("User already exists in ZAPMRO API", { username: cleanUsername });
            return new Response(
              JSON.stringify({ error: "Este nome de usuário já está em uso. Escolha outro.", userExists: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            );
          }
        }
      } catch (e) {
        log("Error checking user existence (continuing)", e);
      }
    }

    // Redirect URL para página de obrigado
    const redirectUrl = `https://maisresultadosonline.com.br/obrigadozapmro`;
    
    // Webhook URL para receber notificação automática de pagamento
    const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook`;

    log("Preparing InfiniPay API request", { 
      email: cleanEmail, 
      username: cleanUsername,
      planType,
      orderNsu, 
      priceInCents,
      webhookUrl
    });

    // Descrição do produto inclui email e username para identificação
    // Formato: ZAPMRO_PLANO_username_email
    const productDescription = `ZAPMRO_${planType === "lifetime" ? "VITALICIO" : "ANUAL"}_${cleanUsername}_${cleanEmail}`;

    // Criar checkout via API oficial
    const lineItems = [{
      description: productDescription,
      quantity: 1,
      price: priceInCents,
    }];

    const infinitepayPayload = {
      handle: INFINITEPAY_HANDLE,
      items: lineItems,
      itens: lineItems,
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
      
      // Fallback: link manual com formato lenc (igual instagram-nova)
      const itemData = [{
        name: productDescription,
        price: priceInCents,
        quantity: 1
      }];
      const itemsEncoded = encodeURIComponent(JSON.stringify(itemData));
      paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${itemsEncoded}&redirect_url=${encodeURIComponent(redirectUrl)}&webhook_url=${encodeURIComponent(webhookUrl)}`;
    } else {
      // InfiniPay retorna { url: "https://checkout.infinitepay.io/..." }
      paymentLink = infinitepayData.url || infinitepayData.checkout_url || infinitepayData.link;
      log("Payment link created via API", { paymentLink, orderNsu });
    }

    if (!paymentLink) {
      log("No payment link found in response, using fallback");
      const itemData = [{
        name: productDescription,
        price: priceInCents,
        quantity: 1
      }];
      const itemsEncoded = encodeURIComponent(JSON.stringify(itemData));
      paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${itemsEncoded}&redirect_url=${encodeURIComponent(redirectUrl)}`;
    }

    // Salvar pedido no banco (expira em 30 minutos)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const { data: orderData, error: insertError } = await supabase
      .from("zapmro_orders")
      .insert({
        email: cleanEmail,
        username: cleanUsername,
        phone: cleanPhone || null,
        plan_type: planType || "annual",
        amount: amount || 397,
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
        username: cleanUsername,
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
