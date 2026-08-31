import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [METODO-SEGUIDOR-CHECKOUT] ${step}`, details ? JSON.stringify(details) : "");
};

const generateNSU = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `MTSEG${timestamp}${random}`.toUpperCase();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Creating checkout");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { email, username, phone, instagramLink, amount } = body;

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!username || username.length < 3) {
      return new Response(
        JSON.stringify({ error: "Usuário deve ter no mínimo 3 caracteres" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate username format (only lowercase letters and numbers)
    if (!/^[a-z0-9]+$/.test(username)) {
      return new Response(
        JSON.stringify({ error: "Usuário deve conter apenas letras minúsculas e números" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.toLowerCase().trim();
    const cleanPhone = phone ? phone.replace(/\D/g, "").trim() : "";
    const cleanInstagramLink = instagramLink ? instagramLink.trim() : "";
    const orderNsu = generateNSU();
    const priceInCents = Math.round((amount || 49) * 100);

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from("metodo_seguidor_users")
      .select("id")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Este usuário já está em uso. Escolha outro." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    log("Creating user and order", { email: cleanEmail, username: cleanUsername });

    // Create user - username is both login AND password
    const { data: userData, error: userError } = await supabase
      .from("metodo_seguidor_users")
      .insert({
        username: cleanUsername,
        password: cleanUsername, // Same as username
        email: cleanEmail,
        phone: cleanPhone || null,
        instagram_username: cleanInstagramLink || null, // Store the link here
        subscription_status: "pending"
      })
      .select()
      .single();

    if (userError) {
      log("Error creating user", userError);
      throw userError;
    }

    // Webhook URL
    const webhookUrl = `${supabaseUrl}/functions/v1/metodo-seguidor-webhook`;
    const redirectUrl = `${supabaseUrl.replace('supabase.co', 'lovable.app').replace('/functions/v1', '')}/metodoseguidormembro`;

    // Product description - ONLY MTSEG_email (simpler format for webhook verification)
    const productDescription = `MTSEG_${cleanEmail}`;

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

    log("Calling InfiniPay", infinitepayPayload);

    const infinitepayResponse = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(infinitepayPayload),
      }
    );

    const infinitepayData = await infinitepayResponse.json();
    log("InfiniPay response", { status: infinitepayResponse.status, data: infinitepayData });

    let paymentLink: string;

    if (!infinitepayResponse.ok) {
      const fallbackItems = JSON.stringify([{
        name: productDescription,
        price: priceInCents,
        quantity: 1
      }]);
      paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${encodeURIComponent(fallbackItems)}&redirect_url=${encodeURIComponent(redirectUrl)}`;
    } else {
      paymentLink = infinitepayData.checkout_url || infinitepayData.link || infinitepayData.url;
    }

    // Create order - expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const { data: orderData, error: orderError } = await supabase
      .from("metodo_seguidor_orders")
      .insert({
        nsu_order: orderNsu,
        email: cleanEmail,
        phone: cleanPhone || null,
        instagram_username: cleanInstagramLink || null,
        amount: amount || 49,
        status: "pending",
        infinitepay_link: paymentLink,
        expired_at: expiresAt.toISOString(),
        user_id: userData.id
      })
      .select()
      .single();

    if (orderError) {
      log("Error creating order", orderError);
      throw orderError;
    }

    log("Checkout created", { orderId: orderData.id, userId: userData.id, productDescription });

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderData.id,
        nsu_order: orderNsu,
        payment_link: paymentLink,
        email: cleanEmail,
        username: cleanUsername,
        expires_at: expiresAt.toISOString()
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
