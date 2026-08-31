import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Euro price ID from Stripe
const STRIPE_PRICE_ID = "price_1SlBAmCFJxkRbtbVibg2xaOQ";
const AMOUNT_EUR = 300;

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [CREATE-EURO-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Creating Euro checkout with Stripe");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { email, username, phone, checkUserExists } = body;

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

    // Check if user already exists in SquareCloud
    if (checkUserExists) {
      try {
        log("Checking if user exists in SquareCloud", { username: cleanUsername });
        const checkUrl = `https://dashboardmroinstagramvini-online.squareweb.app/api/users/${cleanUsername}`;
        const checkResponse = await fetch(checkUrl);
        
        if (checkResponse.ok) {
          const userData = await checkResponse.json();
          if (userData && userData.username) {
            log("User already exists in SquareCloud", { username: cleanUsername });
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

    // Check if Stripe customer already exists
    const customers = await stripe.customers.list({ email: cleanEmail, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      log("Found existing Stripe customer", { customerId });
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://maisresultadosonline.com.br";

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : cleanEmail,
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/instagram-nova-euro?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/instagram-nova-euro?canceled=true`,
      metadata: {
        email: cleanEmail,
        username: cleanUsername,
        phone: cleanPhone,
        plan_type: "annual",
        product: "mro_instagram_euro",
      },
    });

    log("Stripe checkout session created", { sessionId: session.id, url: session.url });

    // Save order to database
    const { data: orderData, error: insertError } = await supabase
      .from("mro_euro_orders")
      .insert({
        email: cleanEmail,
        username: cleanUsername,
        phone: cleanPhone || null,
        plan_type: "annual",
        amount: AMOUNT_EUR,
        status: "pending",
        stripe_session_id: session.id,
      })
      .select()
      .single();

    if (insertError) {
      log("Error saving order", insertError);
      throw insertError;
    }

    log("Order created successfully", { orderId: orderData.id });

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderData.id,
        session_id: session.id,
        payment_url: session.url,
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
