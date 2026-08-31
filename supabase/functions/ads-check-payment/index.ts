import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (message: string, data?: unknown) => {
  console.log(
    `[${new Date().toISOString()}] ${message}`,
    data ? JSON.stringify(data) : "",
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_nsu, email, type } = await req.json();
    const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";

    log("Checking payment (DB-based)", { order_nsu, email: cleanEmail, type });

    if (!order_nsu || !cleanEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "order_nsu e email são obrigatórios" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Check if this is a balance order or initial order
    if (type === 'balance') {
      // Check balance order
      const { data: balanceOrder, error: balanceError } = await supabase
        .from("ads_balance_orders")
        .select("id,status,created_at,paid_at,user_id")
        .eq("nsu_order", order_nsu)
        .maybeSingle();

      if (balanceError || !balanceOrder) {
        log("Balance order not found", { order_nsu, balanceError });
        return new Response(
          JSON.stringify({ success: false, paid: false, error: "Balance order not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (balanceOrder.status === "paid") {
        return new Response(
          JSON.stringify({ success: true, paid: true, message: "Balance order already paid" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Check if expired (5 minutes for balance orders)
      const now = new Date();
      const createdAt = new Date(balanceOrder.created_at);
      const exceeded = now.getTime() - createdAt.getTime() > 5 * 60 * 1000;

      if (exceeded) {
        // Delete expired balance order
        await supabase
          .from("ads_balance_orders")
          .delete()
          .eq("id", balanceOrder.id);

        return new Response(
          JSON.stringify({ success: true, paid: false, expired: true, deleted: true, message: "Balance order expired and deleted" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, paid: false, message: "Balance payment pending" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Default: check initial order (ads_orders)
    const { data: order, error: orderError } = await supabase
      .from("ads_orders")
      .select("id,status,created_at,expired_at")
      .eq("nsu_order", order_nsu)
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (orderError || !order) {
      log("Order not found", { order_nsu, email: cleanEmail, orderError });
      return new Response(
        JSON.stringify({ success: false, paid: false, error: "Order not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (order.status === "paid") {
      return new Response(
        JSON.stringify({ success: true, paid: true, message: "Order already paid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (order.status === "expired") {
      return new Response(
        JSON.stringify({ success: true, paid: false, expired: true, message: "Order expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Expiração: prioriza expired_at (se existir), senão 10 minutos pelo created_at
    const now = new Date();
    const expiredAt = order.expired_at ? new Date(order.expired_at) : null;
    const createdAt = new Date(order.created_at);
    const exceeded = expiredAt ? now > expiredAt : now.getTime() - createdAt.getTime() > 10 * 60 * 1000;

    if (exceeded) {
      await supabase
        .from("ads_orders")
        .update({
          status: "expired",
          expired_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      return new Response(
        JSON.stringify({ success: true, paid: false, expired: true, message: "Order expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Enquanto estiver pendente, quem muda para "paid" é o webhook.
    return new Response(
      JSON.stringify({ success: true, paid: false, message: "Payment pending" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    log("Error checking payment", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
