import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [VERIFY-EURO-PAYMENT] ${step}${detailsStr}`);
};

// Helper to send affiliate email notification
async function sendAffiliateEmail(supabase: any, order: any, supabaseUrl: string) {
  try {
    // Check if there's an affiliate associated with this order
    const { data: affiliatesData } = await supabase.storage
      .from('user-data')
      .download('admin/affiliates.json');
    
    if (!affiliatesData) return;
    
    const affiliatesText = await affiliatesData.text();
    const affiliates = JSON.parse(affiliatesText);
    
    // Check if this order came from an affiliate (you could add affiliate_id to mro_euro_orders)
    // For now, send to all active affiliates or a specific one
    log("Affiliate notification would be sent here for order", { orderId: order.id });
    
  } catch (e) {
    log("Error sending affiliate email", { error: String(e) });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Verifying Euro payment - START");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey) {
      log("ERROR: STRIPE_SECRET_KEY not configured");
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      log("ERROR: Missing Supabase configuration");
      throw new Error("Missing Supabase configuration");
    }

    // Use stable Stripe API version
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { session_id, order_id, manual_approve } = body;
    
    log("Request body received", { session_id, order_id, manual_approve });

    if (!session_id && !order_id) {
      return new Response(
        JSON.stringify({ error: "session_id ou order_id é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    let order;

    // Get order from database
    if (order_id) {
      const { data, error } = await supabase
        .from("mro_euro_orders")
        .select("*")
        .eq("id", order_id)
        .single();

      if (error || !data) {
        log("Order not found", { order_id, error });
        return new Response(
          JSON.stringify({ error: "Pedido não encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }
      order = data;
      log("Order found by ID", { orderId: order.id, status: order.status });
    } else if (session_id) {
      const { data, error } = await supabase
        .from("mro_euro_orders")
        .select("*")
        .eq("stripe_session_id", session_id)
        .single();

      if (error || !data) {
        log("Order not found by session", { session_id, error });
        return new Response(
          JSON.stringify({ error: "Pedido não encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }
      order = data;
      log("Order found by session", { orderId: order.id, status: order.status });
    }

    // If already completed, return success
    if (order.status === "completed") {
      log("Order already completed", { orderId: order.id });
      return new Response(
        JSON.stringify({
          success: true,
          status: "completed",
          order: order,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Manual approval flow
    if (manual_approve === true) {
      log("Manual approval requested", { orderId: order.id });
      
      const now = new Date().toISOString();
      
      // Update order status to paid first
      await supabase
        .from("mro_euro_orders")
        .update({
          status: "paid",
          paid_at: now,
        })
        .eq("id", order.id);
      
      // Create user access in SquareCloud
      try {
        log("Creating user access in SquareCloud (manual)", { username: order.username });
        
        const createUserUrl = `https://dashboardmroinstagramvini-online.squareweb.app/api/users`;
        const createResponse = await fetch(createUserUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: order.username,
            password: order.username,
            days: 365,
            email: order.email,
          }),
        });

        if (createResponse.ok) {
          log("User created successfully in SquareCloud (manual)");
          
          await supabase
            .from("mro_euro_orders")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              api_created: true,
            })
            .eq("id", order.id);

          await supabase
            .from("created_accesses")
            .insert({
              customer_email: order.email,
              customer_name: order.username,
              username: order.username,
              password: order.username,
              service_type: "mro_instagram_euro",
              access_type: "annual",
              days_access: 365,
              expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              api_created: true,
              notes: `Aprovação manual - Order ID: ${order.id}`,
            });

          // Send affiliate notification
          await sendAffiliateEmail(supabase, order, supabaseUrl);

          return new Response(
            JSON.stringify({
              success: true,
              status: "completed",
              message: "Aprovação manual realizada com sucesso!",
              order: { ...order, status: "completed" },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        } else {
          const errorText = await createResponse.text();
          log("Error creating user in SquareCloud (manual)", { error: errorText });
          
          return new Response(
            JSON.stringify({
              success: false,
              status: "paid",
              message: "Pagamento aprovado mas erro ao criar acesso. Tente novamente.",
              error: errorText,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      } catch (apiError) {
        log("Error calling SquareCloud API (manual)", apiError);
        
        return new Response(
          JSON.stringify({
            success: false,
            status: "paid",
            message: "Pagamento aprovado mas erro ao criar acesso.",
            error: String(apiError),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // Check payment status with Stripe
    const stripeSessionId = order.stripe_session_id;
    if (!stripeSessionId) {
      log("No Stripe session ID found", { orderId: order.id });
      return new Response(
        JSON.stringify({ error: "Session ID não encontrado no pedido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    log("Retrieving Stripe session", { sessionId: stripeSessionId });
    
    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
      log("Stripe session retrieved successfully", { 
        sessionId: stripeSession.id, 
        paymentStatus: stripeSession.payment_status,
        status: stripeSession.status
      });
    } catch (stripeError) {
      log("Error retrieving Stripe session", { error: String(stripeError) });
      return new Response(
        JSON.stringify({ 
          error: "Erro ao verificar com Stripe",
          details: String(stripeError),
          status: order.status 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (stripeSession.payment_status === "paid") {
      log("Payment confirmed by Stripe", { orderId: order.id });
      
      const now = new Date().toISOString();

      // Update order status to paid
      await supabase
        .from("mro_euro_orders")
        .update({
          status: "paid",
          paid_at: now,
          stripe_payment_intent: stripeSession.payment_intent as string,
        })
        .eq("id", order.id);

      log("Order marked as paid", { orderId: order.id });

      // Create user access in SquareCloud
      try {
        log("Creating user access in SquareCloud", { username: order.username });
        
        const createUserUrl = `https://dashboardmroinstagramvini-online.squareweb.app/api/users`;
        const createResponse = await fetch(createUserUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: order.username,
            password: order.username,
            days: 365,
            email: order.email,
          }),
        });

        if (createResponse.ok) {
          log("User created successfully in SquareCloud");
          
          await supabase
            .from("mro_euro_orders")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              api_created: true,
            })
            .eq("id", order.id);

          await supabase
            .from("created_accesses")
            .insert({
              customer_email: order.email,
              customer_name: order.username,
              username: order.username,
              password: order.username,
              service_type: "mro_instagram_euro",
              access_type: "annual",
              days_access: 365,
              expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              api_created: true,
              notes: `Pagamento Euro via Stripe - Session: ${stripeSessionId}`,
            });

          // Send affiliate notification
          await sendAffiliateEmail(supabase, order, supabaseUrl);

          return new Response(
            JSON.stringify({
              success: true,
              status: "completed",
              message: "Pagamento confirmado e acesso liberado!",
              order: { ...order, status: "completed" },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        } else {
          const errorText = await createResponse.text();
          log("Error creating user in SquareCloud", { error: errorText });
          
          return new Response(
            JSON.stringify({
              success: true,
              status: "paid",
              message: "Pagamento confirmado! Acesso será liberado em breve.",
              order: { ...order, status: "paid" },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      } catch (apiError) {
        log("Error calling SquareCloud API", apiError);
        
        return new Response(
          JSON.stringify({
            success: true,
            status: "paid",
            message: "Pagamento confirmado! Acesso será liberado em breve.",
            order: { ...order, status: "paid" },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // Payment not confirmed yet
    log("Payment not confirmed yet", { orderId: order.id, stripeStatus: stripeSession.payment_status });
    return new Response(
      JSON.stringify({
        success: false,
        status: order.status,
        stripe_status: stripeSession.payment_status,
        message: "Pagamento ainda não confirmado",
        order: order,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("FATAL ERROR", { message: errorMessage });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
