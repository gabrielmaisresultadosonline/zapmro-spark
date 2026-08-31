import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INSTAGRAM_API_URL = "https://dashboardmroinstagramvini-online.squareweb.app";

const log = (message: string, data?: unknown) => {
  console.log(`[VERIFY-API-ACCESS] ${message}`, data ? JSON.stringify(data) : "");
};

async function checkUserExists(username: string): Promise<boolean> {
  try {
    const response = await fetch(`${INSTAGRAM_API_URL}/api/users/${username}`);
    if (response.ok) {
      const data = await response.json();
      return !!(data && data.username);
    }
    return false;
  } catch (error) {
    log("Error checking user", { username, error: String(error) });
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_ids } = await req.json();

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No order_ids provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("Verifying API access for orders", { count: order_ids.length });

    // Buscar pedidos que precisam verificação (api_created = false ou null)
    const { data: orders, error } = await supabase
      .from("mro_orders")
      .select("id, username, api_created, status")
      .in("id", order_ids)
      .or("api_created.is.null,api_created.eq.false");

    if (error) {
      log("Error fetching orders", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: "No orders need verification" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("Orders to verify", { count: orders.length });

    const updatedIds: string[] = [];

    // Verificar cada usuário na API (em paralelo, máx 5 por vez)
    const batchSize = 5;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(async (order) => {
          const exists = await checkUserExists(order.username);
          return { id: order.id, exists };
        })
      );

      // Atualizar os que existem na API
      for (const result of results) {
        if (result.exists) {
          const { error: updateError } = await supabase
            .from("mro_orders")
            .update({ 
              api_created: true,
              updated_at: new Date().toISOString()
            })
            .eq("id", result.id);

          if (!updateError) {
            updatedIds.push(result.id);
            log("Updated order as api_created", { id: result.id });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: updatedIds.length,
        updatedIds
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log("Error", { error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
