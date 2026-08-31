import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const INFINITEPAY_CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: s });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id obrigatório" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: order, error } = await supabase
      .from("crm_sales_orders").select("*").eq("id", order_id).maybeSingle();
    if (error || !order) return json({ error: "Pedido não encontrado" }, 404);

    if (order.status === "approved") return json({ status: "approved", order });

    // Expire if past expiration
    if (new Date(order.expires_at).getTime() < Date.now()) {
      if (order.status !== "expired") {
        await supabase.from("crm_sales_orders").update({ status: "expired" }).eq("id", order.id);
      }
      return json({ status: "expired" });
    }

    // Poll InfinitePay
    try {
      const r = await fetch(INFINITEPAY_CHECK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: order.nsu_order }),
      });
      const d = await r.json().catch(() => ({}));
      if (d?.paid === true || d?.success === true && d?.paid) {
        await supabase.from("crm_sales_orders").update({
          status: "approved",
          paid_at: new Date().toISOString(),
          transaction_nsu: d.transaction_nsu ?? null,
          invoice_slug: d.slug ?? null,
          raw_webhook: d,
        }).eq("id", order.id);
        return json({ status: "approved" });
      }
    } catch (_) { /* keep pending */ }

    return json({ status: "pending" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});