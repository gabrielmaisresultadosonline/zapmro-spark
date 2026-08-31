import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const PRICE_BRL = 19.90;

const log = (step: string, details?: unknown) => {
  console.log(`[RENDAEXT-CHECKOUT] ${step}`, details ? JSON.stringify(details) : "");
};

const generateNSU = () => {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).substring(2, 8);
  return `RENDAEXT${t}${r}`.toUpperCase();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const body = await req.json();
    const { nome_completo, email, whatsapp } = body;

    if (!nome_completo || !email || !email.includes("@") || !whatsapp) {
      return new Response(
        JSON.stringify({ success: false, error: "Dados inválidos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanName = String(nome_completo).trim();
    const cleanPhone = String(whatsapp).replace(/\D/g, "").trim();
    const orderNsu = generateNSU();
    const priceInCents = Math.round(PRICE_BRL * 100);

    // Save lead
    const { data: lead } = await supabase
      .from("rendaext_leads")
      .insert({
        nome_completo: cleanName,
        email: cleanEmail,
        whatsapp: cleanPhone,
        source: "rendaext-checkout",
      })
      .select()
      .single();

    const redirectUrl = `https://maisresultadosonline.com.br/rendaext?paid=1&nsu=${orderNsu}`;
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/infinitepay-webhook`;

    const productDescription = `RENDAEXT_${cleanEmail}`;

    const lineItems = [{
      description: productDescription,
      quantity: 1,
      price: priceInCents,
    }];

    const infinitepayPayload = {
      handle: INFINITEPAY_HANDLE,
      items: lineItems,
      itens: lineItems,
      order_nsu: orderNsu,
      redirect_url: redirectUrl,
      webhook_url: webhookUrl,
      customer: { email: cleanEmail },
    };

    let paymentLink: string;
    try {
      const resp = await fetch(
        "https://api.infinitepay.io/invoices/public/checkout/links",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(infinitepayPayload),
        }
      );
      const data = await resp.json();
      log("InfiniPay response", { status: resp.status, data });

      if (resp.ok && (data.checkout_url || data.link || data.url)) {
        paymentLink = data.checkout_url || data.link || data.url;
      } else {
        throw new Error("API failed");
      }
    } catch (_e) {
      // Fallback link
      const itemsEncoded = encodeURIComponent(JSON.stringify([{
        name: productDescription,
        price: priceInCents,
        quantity: 1,
      }]));
      paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${itemsEncoded}&redirect_url=${encodeURIComponent(redirectUrl)}&webhook_url=${encodeURIComponent(webhookUrl)}`;
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: order, error: insertError } = await supabase
      .from("rendaext_orders")
      .insert({
        lead_id: lead?.id || null,
        nome_completo: cleanName,
        email: cleanEmail,
        whatsapp: cleanPhone,
        amount: PRICE_BRL,
        nsu_order: orderNsu,
        infinitepay_link: paymentLink,
        status: "pending",
        expired_at: expiresAt,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        nsu_order: orderNsu,
        payment_link: paymentLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
