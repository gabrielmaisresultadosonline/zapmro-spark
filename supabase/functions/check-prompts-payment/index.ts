import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INFINITEPAY_HANDLE = "paguemro";

const log = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-PROMPTS-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    log("Checking Prompts payment");

    const body = await req.json();
    const { nsu_order, transaction_nsu, slug } = body;

    if (!nsu_order) {
      return new Response(
        JSON.stringify({ error: "Missing nsu_order" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Find order
    const { data: order, error: orderError } = await supabase
      .from("prompts_mro_orders")
      .select("*")
      .eq("nsu_order", nsu_order)
      .maybeSingle();

    if (orderError || !order) {
      log("Order not found", { nsu_order });
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Already completed
    if (order.status === "completed") {
      return new Response(
        JSON.stringify({ success: true, status: "completed", order }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Already paid - create access
    if (order.status === "paid") {
      await createUserAccess(supabase, order);
      const { data: updatedOrder } = await supabase
        .from("prompts_mro_orders")
        .select("*")
        .eq("nsu_order", nsu_order)
        .single();
      return new Response(
        JSON.stringify({ success: true, status: updatedOrder?.status || "paid", order: updatedOrder }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Try InfiniPay API checks
    const paymentConfirmed = await checkInfiniPayPayment(order, nsu_order, transaction_nsu, slug);

    if (paymentConfirmed) {
      log("Payment confirmed, updating order");
      await supabase
        .from("prompts_mro_orders")
        .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("nsu_order", nsu_order);

      await createUserAccess(supabase, order);

      const { data: updatedOrder } = await supabase
        .from("prompts_mro_orders")
        .select("*")
        .eq("nsu_order", nsu_order)
        .single();

      return new Response(
        JSON.stringify({ success: true, status: updatedOrder?.status || "paid", order: updatedOrder, payment_confirmed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Still pending
    return new Response(
      JSON.stringify({ success: true, status: "pending", order }),
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

async function checkInfiniPayPayment(order: any, nsu_order: string, transaction_nsu?: string, slug?: string): Promise<boolean> {
  // Method 1: with transaction_nsu and slug
  if (transaction_nsu && slug) {
    try {
      const res = await fetch("https://api.infinitepay.io/invoices/public/checkout/payment_check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: nsu_order, transaction_nsu, slug }),
      });
      const data = await res.json();
      if (data.paid) return true;
    } catch (e) { log("Error checking with transaction_nsu", String(e)); }
  }

  // Method 2: extract lenc from link
  if (order.infinitepay_link) {
    try {
      const url = new URL(order.infinitepay_link);
      const lenc = url.searchParams.get('lenc');
      if (lenc) {
        const res = await fetch("https://api.infinitepay.io/invoices/public/checkout/payment_check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: nsu_order, slug: lenc }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.paid) return true;
        }
      }
    } catch (e) { log("Error checking with lenc", String(e)); }
  }

  // Method 3: direct order_nsu check
  try {
    const res = await fetch("https://api.infinitepay.io/invoices/public/checkout/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: nsu_order }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.paid) return true;
    }
  } catch (e) { log("Error in direct check", String(e)); }

  return false;
}

async function createUserAccess(supabase: any, order: any) {
  if (order.access_created) return;

  log("Creating user access", { email: order.email });

  try {
    // Determine plan days based on amount
    const isMonthly = order.amount <= 50;
    const planDays = isMonthly ? 30 : 365;
    const subEnd = new Date();
    subEnd.setDate(subEnd.getDate() + planDays);

    let userName = order.name || order.email.split("@")[0];
    let userPassword = "";

    // Check if user already exists
    const { data: existing } = await supabase
      .from("prompts_mro_users")
      .select("*")
      .eq("email", order.email)
      .maybeSingle();

    if (existing) {
      // Reactivate existing user with PRO
      await supabase
        .from("prompts_mro_users")
        .update({ 
          status: "active", 
          is_paid: true,
          paid_at: new Date().toISOString(),
          subscription_end: subEnd.toISOString(),
          copies_limit: 999999,
          updated_at: new Date().toISOString() 
        })
        .eq("id", existing.id);
      userName = existing.name;
      userPassword = existing.password;
    } else {
      // Create new user
      userPassword = order.email.split("@")[0] + "2025";
      await supabase.from("prompts_mro_users").insert({
        name: userName,
        email: order.email,
        password: userPassword,
        status: "active",
        is_paid: true,
        paid_at: new Date().toISOString(),
        subscription_end: subEnd.toISOString(),
        copies_limit: 999999,
      });
    }

    // Also update prompts_mro_payment_orders if exists
    await supabase
      .from("prompts_mro_payment_orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("email", order.email)
      .eq("status", "pending");

    // Mark order as completed
    await supabase
      .from("prompts_mro_orders")
      .update({
        status: "completed",
        access_created: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // Send confirmation email
    await sendProConfirmationEmail(order.email, userName, userPassword, isMonthly);

    log("User access created and email sent successfully");
  } catch (e) {
    log("Error creating user access", String(e));
  }
}

async function sendProConfirmationEmail(email: string, name: string, password: string, isMonthly: boolean = false) {
  try {
    const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD");
    if (!SMTP_PASSWORD) {
      log("SMTP not configured, skipping email");
      return;
    }

    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.hostinger.com",
        port: 465,
        tls: true,
        auth: { username: "suporte@maisresultadosonline.com.br", password: SMTP_PASSWORD },
      },
    });

    const planLabel = isMonthly ? 'PRO Mensal' : 'PRO Anual';
    const planDuration = isMonthly ? '30 dias' : '365 dias';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0f;color:#fff;padding:30px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:20px;">
          <img src="https://adljdeekwifwcdcgbpit.supabase.co/storage/v1/object/public/assets/logo-mro-email.png" alt="MRO" style="height:50px;" />
        </div>
        <h1 style="color:#22c55e;text-align:center;font-size:24px;">🎉 Pagamento Confirmado!</h1>
        <p style="text-align:center;color:#ccc;font-size:16px;">Seu plano <strong style="color:#22c55e;">${planLabel}</strong> foi ativado com sucesso!</p>
        <div style="background:#111;padding:20px;border-radius:12px;margin:20px 0;border:1px solid #22c55e33;">
          <p style="margin:8px 0;"><strong style="color:#22c55e;">👤 Nome:</strong> ${name}</p>
          <p style="margin:8px 0;"><strong style="color:#22c55e;">📧 E-mail:</strong> ${email}</p>
          <p style="margin:8px 0;"><strong style="color:#22c55e;">🔑 Senha:</strong> ${password}</p>
          <p style="margin:8px 0;"><strong style="color:#22c55e;">⭐ Plano:</strong> ${planLabel} - Acesso Ilimitado por ${planDuration}</p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="https://prompt.maisresultadosonline.com.br" style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#000;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">Acessar Plataforma</a>
        </div>
        <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">Obrigado por confiar na MRO! 💚</p>
      </div>
    `;

    await client.send({
      from: "Prompts MRO <suporte@maisresultadosonline.com.br>",
      to: email,
      subject: `🎉 Pagamento Confirmado - Plano ${isMonthly ? 'PRO Mensal' : 'PRO Anual'} Ativado!`,
      html,
    });
    await client.close();
    log("Pro confirmation email sent", { email });
  } catch (e) {
    log("Error sending confirmation email", String(e));
  }
}
