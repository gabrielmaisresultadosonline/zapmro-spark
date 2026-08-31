import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";

const log = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-PROMPTS-CHECKOUT] ${step}${detailsStr}`);
};

const generateNSU = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `PROMPTS${timestamp}${random}`.toUpperCase();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Creating Prompts MRO checkout link");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { email, name, phone, plan_type } = body;

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const selectedPlan = plan_type === 'monthly' ? 'monthly' : 'annual';
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = (name || "").trim();
    const cleanPhone = phone ? phone.replace(/\D/g, "").trim() : "";
    const orderNsu = generateNSU();
    const amount = selectedPlan === 'monthly' ? 47 : 97;
    const planLabel = selectedPlan === 'monthly' ? 'MENSAL' : 'ANUAL';
    const priceInCents = amount * 100;

    // Check if email already has active access
    const { data: existingUser } = await supabase
      .from("prompts_mro_users")
      .select("id, status")
      .eq("email", cleanEmail)
      .eq("status", "active")
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Este e-mail já possui acesso ativo. Faça login para acessar." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const redirectUrl = `https://maisresultadosonline.com.br/prompts`;
    const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook`;

    const productDescription = `PROMPTS_${planLabel}_${cleanEmail}`;

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
      customer: { email: cleanEmail },
    };

    log("Calling InfiniPay API", infinitepayPayload);

    const infinitepayResponse = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(infinitepayPayload),
      }
    );

    const infinitepayData = await infinitepayResponse.json();
    log("InfiniPay API response", { status: infinitepayResponse.status, data: infinitepayData });

    let paymentLink: string;

    if (!infinitepayResponse.ok) {
      log("InfiniPay API error, using fallback link", infinitepayData);
      const itemData = [{ name: productDescription, price: priceInCents, quantity: 1 }];
      const itemsEncoded = encodeURIComponent(JSON.stringify(itemData));
      paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${itemsEncoded}&redirect_url=${encodeURIComponent(redirectUrl)}&webhook_url=${encodeURIComponent(webhookUrl)}`;
    } else {
      paymentLink = infinitepayData.checkout_url || infinitepayData.link || infinitepayData.url;
      log("Payment link created via API", { paymentLink, orderNsu });
    }

    // Save order (expires in 30 minutes)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const { data: orderData, error: insertError } = await supabase
      .from("prompts_mro_orders")
      .insert({
        email: cleanEmail,
        name: cleanName || null,
        phone: cleanPhone || null,
        plan_type: selectedPlan,
        amount,
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
