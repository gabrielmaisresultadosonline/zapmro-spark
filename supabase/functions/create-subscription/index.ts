import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { email, username, instagram_username } = await req.json();
    
    if (!email || !username) {
      throw new Error("Email e nome de usuário são obrigatórios");
    }

    logStep("Request data", { email, username, instagram_username });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabaseClient
      .from('paid_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (checkError) {
      logStep("Error checking existing user", { error: checkError.message });
    }

    let userId: string;

    if (existingUser) {
      logStep("User already exists", { userId: existingUser.id });
      userId = existingUser.id;
      
      // If user already has active subscription, redirect to dashboard
      if (existingUser.subscription_status === 'active') {
        return new Response(JSON.stringify({ 
          redirect: '/membro',
          message: 'Você já possui uma assinatura ativa' 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    } else {
      // Create new user
      const { data: newUser, error: insertError } = await supabaseClient
        .from('paid_users')
        .insert({
          email,
          username,
          instagram_username
        })
        .select()
        .single();

      if (insertError) {
        logStep("Error creating user", { error: insertError.message });
        throw new Error("Erro ao criar usuário: " + insertError.message);
      }

      userId = newUser.id;
      logStep("User created", { userId });
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if Stripe customer exists
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
    } else {
      const customer = await stripe.customers.create({
        email,
        name: username,
        metadata: { user_id: userId }
      });
      customerId = customer.id;
      logStep("Stripe customer created", { customerId });
    }

    // Update user with Stripe customer ID
    await supabaseClient
      .from('paid_users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);

    // Create checkout session with PIX payment
    const origin = req.headers.get("origin") || "https://adljdeekwifwcdcgbpit.lovableproject.com";
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: "price_1ScYPiCFJxkRbtbVRjlYyDLW", // R$57/mês - Plano Premium
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/membro?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/vendas?canceled=true`,
      metadata: {
        user_id: userId,
        instagram_username: instagram_username || ''
      },
      locale: 'pt-BR',
      allow_promotion_codes: true,
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
