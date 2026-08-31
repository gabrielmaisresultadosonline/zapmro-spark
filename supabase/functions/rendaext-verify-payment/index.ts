import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendRendaExtEmail } from "../_shared/rendaext-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";

const log = (step: string, details?: unknown) => {
  console.log(`[RENDAEXT-VERIFY] ${step}`, details ? JSON.stringify(details) : "");
};


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { nsu_order } = await req.json();
    if (!nsu_order) {
      return new Response(JSON.stringify({ success: false, error: "nsu_order required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const { data: order } = await supabase
      .from("rendaext_orders")
      .select("*")
      .eq("nsu_order", nsu_order)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ success: false, error: "Order not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
    }

    // If already paid, check if email was sent
    if (order.status === "paid") {
      if (!order.email_sent) {
        log("Order already paid but email not sent, sending now...");
        const emailSent = await sendRendaExtEmail(order.email, order.nome_completo);
        if (emailSent) {
          await supabase.from("rendaext_orders").update({
            email_sent: true,
            email_sent_at: new Date().toISOString(),
          }).eq("id", order.id);
        }
        return new Response(JSON.stringify({ success: true, paid: true, emailSent }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, paid: true, alreadyPaid: true, emailSent: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify with InfiniPay
    let paid = false;
    try {
      const resp = await fetch(
        "https://api.infinitepay.io/invoices/public/checkout/payment_check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: nsu_order }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        paid = data.paid === true;
      }
    } catch (e) {
      log("InfiniPay verify error", { e: String(e) });
    }

    if (!paid) {
      return new Response(JSON.stringify({ success: true, paid: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark as paid + send email
    const emailSent = await sendRendaExtEmail(order.email, order.nome_completo);

    // Track Purchase with Meta
    try {
      await supabase.functions.invoke('meta-conversions', {
        body: {
          event_name: 'Purchase',
          event_source_url: 'https://maisresultadosonline.com.br/rendaext',
          email: order.email,
          phone: order.whatsapp,
          value: 19.90,
          currency: 'BRL',
          content_name: 'Renda Extra - Aula'
        }
      });
    } catch (metaErr) {
      log("Meta tracking error", { e: String(metaErr) });
    }

    await supabase
      .from("rendaext_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        email_sent: emailSent,
        email_sent_at: emailSent ? new Date().toISOString() : null,
      })
      .eq("id", order.id);

    return new Response(JSON.stringify({ success: true, paid: true, emailSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
