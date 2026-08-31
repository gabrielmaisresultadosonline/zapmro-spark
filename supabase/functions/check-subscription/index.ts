import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { email, session_id } = await req.json();
    
    if (!email && !session_id) {
      throw new Error("Email ou session_id são obrigatórios");
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let userEmail = email;
    let subscriptionId: string | null = null;
    let subscriptionEnd: string | null = null;
    let subscriptionStatus = 'pending';

    // If session_id provided, verify the checkout session
    if (session_id) {
      logStep("Verifying session", { session_id });
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      if (session.payment_status === 'paid' || session.status === 'complete') {
        userEmail = session.customer_details?.email || email;
        subscriptionId = session.subscription as string;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
          subscriptionStatus = subscription.status === 'active' ? 'active' : 'pending';
        }
        
        logStep("Session verified", { 
          email: userEmail, 
          subscriptionId, 
          subscriptionStatus,
          subscriptionEnd 
        });
      }
    } else {
      // Check by email
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      
      if (customers.data.length > 0) {
        const customerId = customers.data[0].id;
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          subscriptionId = subscription.id;
          subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
          subscriptionStatus = 'active';
        }
      }
    }

    // Update user in database
    const { data: user, error: updateError } = await supabaseClient
      .from('paid_users')
      .update({
        subscription_status: subscriptionStatus,
        subscription_id: subscriptionId,
        subscription_end: subscriptionEnd
      })
      .eq('email', userEmail)
      .select()
      .maybeSingle();

    if (updateError) {
      logStep("Error updating user", { error: updateError.message });
    }

    logStep("Subscription check complete", { 
      email: userEmail,
      subscriptionStatus,
      user: user?.id
    });

    return new Response(JSON.stringify({
      subscribed: subscriptionStatus === 'active',
      subscription_status: subscriptionStatus,
      subscription_end: subscriptionEnd,
      user
    }), {
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
