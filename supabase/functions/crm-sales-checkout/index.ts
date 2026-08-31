import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendCrmSalesRegisteredEmail } from "../_shared/zapmro-sales-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";
const INFINITEPAY_URL = "https://api.checkout.infinitepay.io/links";

const PLANS: Record<string, { label: string; amount: number }> = {
  mensal: { label: "Plano Mensal", amount: 97 },
  semestral: { label: "Plano 6 Meses", amount: 397 },
  anual: { label: "Plano Anual (1 ano)", amount: 597 },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function nsu() {
  return `CRM${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { fullName, email, whatsapp, password, plan } = body || {};

    if (!fullName || !email || !whatsapp || !password || !plan) {
      return json({ error: "Campos obrigatórios faltando" }, 400);
    }
    if (!email.includes("@")) return json({ error: "Email inválido" }, 400);
    if (String(password).length < 6) return json({ error: "Senha mínima de 6 caracteres" }, 400);

    const selected = PLANS[plan];
    if (!selected) return json({ error: "Plano inválido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanWhats = String(whatsapp).replace(/\D/g, "");
    const orderNsu = nsu();
    const priceInCents = Math.round(selected.amount * 100);
    const passwordHash = await sha256(String(password));

    const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const webhookUrl = `${supaUrl}/functions/v1/infinitepay-webhook`;
    const redirectUrl = `https://maisresultadosonline.com.br/pagamentoobrigado`;

    const lineItems = [{
      description: `CRMSALES_${plan}_${cleanEmail}`,
      quantity: 1,
      price: priceInCents,
    }];

    const ipPayload = {
      handle: INFINITEPAY_HANDLE,
      items: lineItems,
      itens: lineItems,
      order_nsu: orderNsu,
      redirect_url: redirectUrl,
      webhook_url: webhookUrl,
      customer: { name: fullName, email: cleanEmail, phone_number: cleanWhats },
    };

    let paymentLink = "";
    try {
      const r = await fetch(INFINITEPAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ipPayload),
      });
      const d = await r.json().catch(() => ({}));
      paymentLink = d.checkout_url || d.link || d.url || "";
    } catch (_) { /* fallback below */ }

    if (!paymentLink) {
      const fb = JSON.stringify([{ name: lineItems[0].description, price: priceInCents, quantity: 1 }]);
      const prefill = new URLSearchParams({
        items: fb,
        redirect_url: redirectUrl,
        customer_name: fullName,
        customer_email: cleanEmail,
        customer_phone: cleanWhats,
        name: fullName,
        email: cleanEmail,
        phone: cleanWhats,
        order_nsu: orderNsu,
      });
      paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?${prefill.toString()}`;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data: order, error: insertErr } = await supabase
      .from("crm_sales_orders")
      .insert({
        full_name: fullName,
        email: cleanEmail,
        whatsapp: cleanWhats,
        password_hash: passwordHash,
        plan,
        plan_label: selected.label,
        amount: selected.amount,
        nsu_order: orderNsu,
        infinitepay_link: paymentLink,
        status: "pending",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);

    // Envia email de confirmação de cadastro com credenciais e link de pagamento
    // (não bloqueia a resposta caso falhe)
    try {
      await sendCrmSalesRegisteredEmail({
        to: cleanEmail,
        fullName,
        planLabel: selected.label,
        amount: selected.amount,
        password: String(password),
        paymentLink,
      });
    } catch (e) {
      console.error("Falha ao enviar email de cadastro:", e);
    }

    return json({
      success: true,
      order_id: order.id,
      nsu_order: orderNsu,
      payment_link: paymentLink,
      expires_at: expiresAt,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});