import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-INFINITEPAY] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Starting payment verification");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const now = new Date();

    // Get all pending orders that haven't expired
    const { data: pendingOrders, error: fetchError } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("status", "pending")
      .gt("expires_at", now.toISOString());

    if (fetchError) {
      log("Error fetching pending orders", fetchError);
      throw fetchError;
    }

    log("Found pending orders", { count: pendingOrders?.length || 0 });

    // Mark expired orders
    const { error: expireError } = await supabase
      .from("payment_orders")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", now.toISOString());

    if (expireError) {
      log("Error expiring orders", expireError);
    }

    // For now, we'll simulate verification
    // In production, you would call InfiniPay API to check payment status
    // The InfiniPay Link Integrado typically requires webhook configuration
    // or manual verification through their dashboard
    
    let verifiedCount = 0;

    // Note: InfiniPay Link Integrado doesn't have a public API for status checking
    // Payments are typically confirmed via:
    // 1. Webhook notifications (requires HTTPS endpoint configuration in InfiniPay dashboard)
    // 2. Manual verification in InfiniPay dashboard
    // 3. Customer confirmation on success page
    
    // For this implementation, the admin can manually mark payments as paid
    // or set up a webhook endpoint to receive InfiniPay notifications

    log("Verification complete", { verified: verifiedCount, pending: pendingOrders?.length || 0 });

    return new Response(
      JSON.stringify({
        success: true,
        verified: verifiedCount,
        pending: pendingOrders?.length || 0,
        message: "Verificação concluída. Pagamentos pendentes podem ser confirmados manualmente ou via webhook.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: errorMessage });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
