import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [CHECK-CORRETOR-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Checking payment status");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { nsu_order, email } = body;

    if (!nsu_order && !email) {
      return new Response(
        JSON.stringify({ error: "NSU ou email é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Buscar pedido
    let query = supabase.from("corretor_orders").select("*");
    
    if (nsu_order) {
      query = query.eq("nsu_order", nsu_order);
    } else {
      query = query.eq("email", email.toLowerCase()).order("created_at", { ascending: false }).limit(1);
    }

    const { data: order, error } = await query.single();

    if (error || !order) {
      log("Order not found", { nsu_order, email });
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: "not_found",
          message: "Pedido não encontrado" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    log("Order found", { id: order.id, status: order.status });

    // Verificar se expirou
    if (order.status === "pending" && order.expired_at) {
      const expiredAt = new Date(order.expired_at);
      if (new Date() > expiredAt) {
        // Marcar como expirado
        await supabase
          .from("corretor_orders")
          .update({ status: "expired" })
          .eq("id", order.id);

        return new Response(
          JSON.stringify({
            success: false,
            status: "expired",
            message: "Pedido expirado. Por favor, gere um novo link de pagamento."
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // Se já está pago ou completo
    if (order.status === "paid" || order.status === "completed") {
      return new Response(
        JSON.stringify({
          success: true,
          status: order.status,
          paid: true,
          email: order.email,
          message: "Pagamento confirmado!"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Ainda pendente
    return new Response(
      JSON.stringify({
        success: true,
        status: order.status,
        paid: false,
        email: order.email,
        message: "Aguardando confirmação de pagamento..."
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
