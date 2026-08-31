import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "_prompts_mro_salt_2025");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const INFINITEPAY_HANDLE = "paguemro";

const generateNSU = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `PROMPTS${timestamp}${random}`.toUpperCase();
};

async function sendEmail(to: string, subject: string, html: string) {
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");
  if (!smtpPassword) {
    console.error("[PROMPTS-EMAIL] SMTP not configured");
    return false;
  }
  try {
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.hostinger.com",
        port: 465,
        tls: true,
        auth: {
          username: "suporte@maisresultadosonline.com.br",
          password: smtpPassword,
        },
      },
    });
    await client.send({
      from: "Prompts MRO <suporte@maisresultadosonline.com.br>",
      to,
      subject,
      html,
    });
    await client.close();
    console.log("[PROMPTS-EMAIL] Sent to", to);
    return true;
  } catch (e) {
    console.error("[PROMPTS-EMAIL] Error:", e);
    return false;
  }
}

function buildWelcomeEmail(name: string, email: string, password: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:30px;text-align:center;">
<div style="background:#fff;color:#7c3aed;display:inline-block;padding:8px 20px;border-radius:8px;font-size:24px;font-weight:bold;letter-spacing:2px;">✨ PROMPTS MRO</div>
<h1 style="color:#fff;margin:15px 0 0;font-size:22px;">Cadastro Realizado com Sucesso!</h1>
</td></tr>
<tr><td style="padding:30px;">

<div style="background:#f0fdf4;border:1px solid #22c55e;padding:15px;border-radius:10px;margin-bottom:20px;text-align:center;">
<p style="margin:0;color:#16a34a;font-size:16px;font-weight:bold;">✅ Bem-vindo(a), ${name}!</p>
</div>

<p style="font-size:15px;color:#333;">Seu cadastro na plataforma <strong>Prompts MRO</strong> foi realizado com sucesso! 🎉</p>

<div style="background:#faf5ff;border:2px solid #7c3aed;border-radius:10px;padding:20px;margin:20px 0;">
<h3 style="color:#7c3aed;margin:0 0 15px;">📋 Seus Dados de Acesso:</h3>
<table width="100%">
<tr><td style="padding:8px 12px;background:#f3f4f6;border-radius:5px;margin-bottom:8px;">
<span style="font-size:12px;color:#666;display:block;">Nome:</span>
<span style="font-size:16px;color:#000;font-weight:bold;">${name}</span>
</td></tr>
<tr><td style="height:8px"></td></tr>
<tr><td style="padding:8px 12px;background:#f3f4f6;border-radius:5px;">
<span style="font-size:12px;color:#666;display:block;">E-mail:</span>
<span style="font-size:16px;color:#000;font-family:monospace;">${email}</span>
</td></tr>
<tr><td style="height:8px"></td></tr>
<tr><td style="padding:8px 12px;background:#f3f4f6;border-radius:5px;">
<span style="font-size:12px;color:#666;display:block;">Senha:</span>
<span style="font-size:16px;color:#000;font-family:monospace;font-weight:bold;">${password}</span>
</td></tr>
</table>
</div>

<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:15px;border-radius:0 8px 8px 0;margin:20px 0;">
<p style="margin:0;color:#92400e;font-size:14px;"><strong>🎁 Você recebeu 5 créditos GRÁTIS!</strong><br>
Faça até 5 cópias de prompts totalmente gratuitas para testar a plataforma. Após esgotar seus créditos gratuitos, você pode desbloquear o acesso completo: <strong>R$47/mês</strong> ou <strong>R$97/ano</strong>.</p>
</div>

<table width="100%"><tr><td style="text-align:center;padding:20px 0;">
<a href="https://maisresultadosonline.com.br/prompts/dashboard" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-decoration:none;padding:15px 40px;border-radius:8px;font-weight:bold;font-size:16px;">🚀 Acessar Dashboard de Prompts</a>
</td></tr></table>

</td></tr>
<tr><td style="background:#1a1a1a;padding:20px;text-align:center;">
<p style="color:#a855f7;margin:0 0 8px;font-weight:bold;">Prompts MRO ✨</p>
<p style="color:#888;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
</td></tr>
</table></body></html>`;
}

function buildPaymentConfirmationEmail(name: string, subscriptionEnd: string) {
  const endDate = new Date(subscriptionEnd);
  const formattedEnd = endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const now = new Date();
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
<tr><td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:30px;text-align:center;">
<div style="background:#fff;color:#22c55e;display:inline-block;padding:8px 20px;border-radius:8px;font-size:24px;font-weight:bold;letter-spacing:2px;">✨ PROMPTS MRO</div>
<h1 style="color:#fff;margin:15px 0 0;font-size:22px;">🎉 Pagamento Confirmado!</h1>
</td></tr>
<tr><td style="padding:30px;">

<div style="background:#f0fdf4;border:2px solid #22c55e;padding:20px;border-radius:10px;margin-bottom:20px;text-align:center;">
<p style="margin:0 0 5px;color:#16a34a;font-size:20px;font-weight:bold;">Parabéns, ${name}! 🥳</p>
<p style="margin:0;color:#333;font-size:15px;">Agora você tem acesso liberado a <strong>TODOS os prompts</strong> por <strong>1 ano completo!</strong></p>
</div>

<div style="background:linear-gradient(135deg,#7c3aed10,#ec489910);border:2px solid #7c3aed;border-radius:10px;padding:20px;margin:20px 0;text-align:center;">
<p style="margin:0 0 8px;font-size:14px;color:#666;">Seu acesso é válido até:</p>
<p style="margin:0;font-size:28px;font-weight:bold;color:#7c3aed;">${formattedEnd}</p>
<p style="margin:8px 0 0;font-size:16px;color:#333;">⏱️ <strong>${daysRemaining} dias</strong> restantes</p>
</div>

<h3 style="color:#333;margin:25px 0 15px;">O que você ganhou:</h3>
<table width="100%">
<tr><td style="padding:8px 0;"><span style="background:#7c3aed;color:#fff;padding:3px 10px;border-radius:15px;font-size:13px;margin-right:8px;">✓</span> Acesso a <strong>+1000 prompts</strong> profissionais</td></tr>
<tr><td style="padding:8px 0;"><span style="background:#7c3aed;color:#fff;padding:3px 10px;border-radius:15px;font-size:13px;margin-right:8px;">✓</span> Cópias <strong>ilimitadas</strong></td></tr>
<tr><td style="padding:8px 0;"><span style="background:#7c3aed;color:#fff;padding:3px 10px;border-radius:15px;font-size:13px;margin-right:8px;">✓</span> <strong>Atualizações</strong> durante 1 ano</td></tr>
<tr><td style="padding:8px 0;"><span style="background:#7c3aed;color:#fff;padding:3px 10px;border-radius:15px;font-size:13px;margin-right:8px;">✓</span> Categorias <strong>Feminino, Masculino e Geral</strong></td></tr>
</table>

<table width="100%"><tr><td style="text-align:center;padding:25px 0;">
<a href="https://maisresultadosonline.com.br/prompts/dashboard" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-decoration:none;padding:15px 40px;border-radius:8px;font-weight:bold;font-size:16px;">🚀 Acessar Meus Prompts</a>
</td></tr></table>

</td></tr>
<tr><td style="background:#1a1a1a;padding:20px;text-align:center;">
<p style="color:#22c55e;margin:0 0 8px;font-weight:bold;">Obrigado por confiar na Prompts MRO! 💚</p>
<p style="color:#888;margin:0;font-size:12px;">© ${new Date().getFullYear()} MRO - Mais Resultados Online</p>
</td></tr>
</table></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Login
    if (action === 'login') {
      const { email, password } = await req.json();
      
      if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email e senha são obrigatórios' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const { data: user, error } = await supabase
        .from('prompts_mro_users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .eq('status', 'active')
        .maybeSingle();

      if (error || !user) {
        return new Response(JSON.stringify({ error: 'E-mail não encontrado ou conta inativa' }), { 
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      let passwordMatch = false;
      const hashedInput = await hashPassword(password);
      
      if (user.password === hashedInput) {
        passwordMatch = true;
      } else if (user.password === password) {
        passwordMatch = true;
        await supabase.from('prompts_mro_users').update({ password: hashedInput }).eq('id', user.id);
      }

      if (!passwordMatch) {
        return new Response(JSON.stringify({ error: 'Senha incorreta' }), { 
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      await supabase.from('prompts_mro_users').update({ last_access: new Date().toISOString() }).eq('id', user.id);

      // Calculate days remaining
      let daysRemaining: number | null = null;
      if (user.is_paid && user.subscription_end) {
        const end = new Date(user.subscription_end);
        daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0) daysRemaining = 0;
      }

      return new Response(JSON.stringify({ 
        success: true, 
        user: { 
          id: user.id, name: user.name, email: user.email, 
          copies_count: user.copies_count || 0, copies_limit: user.copies_limit || 5, 
          is_paid: user.is_paid || false, days_remaining: daysRemaining,
          subscription_end: user.subscription_end 
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Register new user
    if (action === 'register') {
      const { name, email, password, phone } = await req.json();
      
      if (!name || !email || !password) {
        return new Response(JSON.stringify({ error: 'Nome, email e senha são obrigatórios' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const { data: existing } = await supabase
        .from('prompts_mro_users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: 'Este e-mail já está cadastrado. Faça login.' }), { 
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const hashedPassword = await hashPassword(password);

      const { data: newUser, error: insertError } = await supabase
        .from('prompts_mro_users')
        .insert({
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          phone: phone ? phone.trim() : null,
          status: 'active',
          last_access: new Date().toISOString(),
          copies_count: 0,
          copies_limit: 5,
          is_paid: false,
        })
        .select('id, name, email, copies_count, copies_limit, is_paid')
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Erro ao criar conta' }), { 
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Send welcome email (async, don't block response)
      sendEmail(
        normalizedEmail,
        "✨ Cadastro Realizado - Prompts MRO | 5 Créditos Grátis!",
        buildWelcomeEmail(name.trim(), normalizedEmail, password)
      ).catch(e => console.error("Welcome email error:", e));

      return new Response(JSON.stringify({ 
        success: true, 
        user: { id: newUser.id, name: newUser.name, email: newUser.email, copies_count: newUser.copies_count, copies_limit: newUser.copies_limit, is_paid: newUser.is_paid }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get prompts
    if (action === 'get-prompts') {
      const { data: prompts, error } = await supabase
        .from('prompts_mro_items')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({ prompts: prompts || [] }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Track copy action
    if (action === 'track-copy') {
      const { user_id } = await req.json();
      
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id é obrigatório' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const { data: user, error } = await supabase
        .from('prompts_mro_users')
        .select('id, copies_count, copies_limit, is_paid')
        .eq('id', user_id)
        .single();

      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), { 
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (user.is_paid) {
        return new Response(JSON.stringify({ success: true, copies_count: user.copies_count, copies_limit: user.copies_limit, is_paid: true, blocked: false }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const newCount = (user.copies_count || 0) + 1;
      const blocked = newCount >= (user.copies_limit || 5);

      await supabase.from('prompts_mro_users').update({ copies_count: newCount }).eq('id', user_id);

      return new Response(JSON.stringify({ 
        success: true, copies_count: newCount, copies_limit: user.copies_limit || 5, is_paid: false, blocked 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get user status
    if (action === 'user-status') {
      const { user_id } = await req.json();
      
      const { data: user } = await supabase
        .from('prompts_mro_users')
        .select('id, copies_count, copies_limit, is_paid, subscription_end')
        .eq('id', user_id)
        .single();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), { 
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const blocked = !user.is_paid && (user.copies_count || 0) >= (user.copies_limit || 5);
      let daysRemaining: number | null = null;
      if (user.is_paid && user.subscription_end) {
        const end = new Date(user.subscription_end);
        daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0) daysRemaining = 0;
      }

      return new Response(JSON.stringify({ 
        copies_count: user.copies_count || 0, copies_limit: user.copies_limit || 5, 
        is_paid: user.is_paid || false, blocked, days_remaining: daysRemaining,
        subscription_end: user.subscription_end
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create payment checkout
    if (action === 'create-payment') {
      const { user_id, plan_type } = await req.json();
      
      const { data: user } = await supabase
        .from('prompts_mro_users')
        .select('id, email, name')
        .eq('id', user_id)
        .single();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), { 
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const selectedPlan = plan_type === 'monthly' ? 'monthly' : 'annual';
      const amount = selectedPlan === 'monthly' ? 47 : 97;
      const planLabel = selectedPlan === 'monthly' ? 'MENSAL' : 'ANUAL';

      const orderNsu = generateNSU();
      const priceInCents = amount * 100;
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const redirectUrl = `https://maisresultadosonline.com.br/prompts/dashboard`;
      const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook`;
      const productDescription = `PROMPTS_${planLabel}_${user.email}`;

      const lineItems = [{ description: productDescription, quantity: 1, price: priceInCents }];

      const infinitepayPayload = {
        handle: INFINITEPAY_HANDLE,
        items: lineItems,
        itens: lineItems,
        order_nsu: orderNsu,
        redirect_url: redirectUrl,
        webhook_url: webhookUrl,
        customer: { email: user.email },
      };

      const infinitepayResponse = await fetch(
        "https://api.infinitepay.io/invoices/public/checkout/links",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(infinitepayPayload) }
      );

      const infinitepayData = await infinitepayResponse.json();

      let paymentLink: string;
      if (!infinitepayResponse.ok) {
        const itemData = [{ name: productDescription, price: priceInCents, quantity: 1 }];
        const itemsEncoded = encodeURIComponent(JSON.stringify(itemData));
        paymentLink = `https://checkout.infinitepay.io/${INFINITEPAY_HANDLE}?items=${itemsEncoded}&redirect_url=${encodeURIComponent(redirectUrl)}&webhook_url=${encodeURIComponent(webhookUrl)}`;
      } else {
        paymentLink = infinitepayData.checkout_url || infinitepayData.link || infinitepayData.url;
      }

      await supabase.from('prompts_mro_payment_orders').insert({
        user_id: user.id, email: user.email, amount, nsu_order: orderNsu,
        status: 'pending', infinitepay_link: paymentLink,
        expired_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      await supabase.from('prompts_mro_users').update({ payment_nsu: orderNsu }).eq('id', user.id);

      return new Response(JSON.stringify({ success: true, payment_link: paymentLink, nsu_order: orderNsu }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Check payment status
    if (action === 'check-payment') {
      const { user_id } = await req.json();

      const { data: user } = await supabase
        .from('prompts_mro_users')
        .select('id, email, name, payment_nsu, is_paid, subscription_end')
        .eq('id', user_id)
        .single();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), { 
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (user.is_paid) {
        let daysRemaining: number | null = null;
        if (user.subscription_end) {
          daysRemaining = Math.ceil((new Date(user.subscription_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        }
        return new Response(JSON.stringify({ success: true, is_paid: true, days_remaining: daysRemaining }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (!user.payment_nsu) {
        return new Response(JSON.stringify({ success: true, is_paid: false }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const { data: order } = await supabase
        .from('prompts_mro_payment_orders')
        .select('*')
        .eq('nsu_order', user.payment_nsu)
        .maybeSingle();

      if (!order) {
        return new Response(JSON.stringify({ success: true, is_paid: false }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const unlockUser = async () => {
        // Determine plan days based on payment amount
        const isMonthly = order.amount <= 50;
        const planDays = isMonthly ? 30 : 365;
        const planLabel = isMonthly ? 'Mensal (30 dias)' : 'Anual (365 dias)';
        const subscriptionEnd = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();
        
        await supabase.from('prompts_mro_users').update({ 
          is_paid: true, paid_at: new Date().toISOString(), subscription_end: subscriptionEnd
        }).eq('id', user.id);

        await supabase.from('prompts_mro_payment_orders').update({ 
          status: 'completed', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() 
        }).eq('id', order.id);

        // Send payment confirmation email
        sendEmail(
          user.email,
          `🎉 Pagamento Confirmado - Plano ${planLabel} Prompts MRO!`,
          buildPaymentConfirmationEmail(user.name || 'Cliente', subscriptionEnd)
        ).catch(e => console.error("Payment email error:", e));

        return subscriptionEnd;
      };

      if (order.status === 'paid' || order.status === 'completed') {
        const subEnd = await unlockUser();
        const daysRemaining = Math.ceil((new Date(subEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return new Response(JSON.stringify({ success: true, is_paid: true, days_remaining: daysRemaining }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Try InfiniPay verification
      let paid = false;
      try {
        const res = await fetch("https://api.infinitepay.io/invoices/public/checkout/payment_check", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: user.payment_nsu }),
        });
        if (res.ok) { const data = await res.json(); if (data.paid) paid = true; }
      } catch (e) { console.error('InfiniPay check error:', e); }

      if (!paid && order.infinitepay_link) {
        try {
          const linkUrl = new URL(order.infinitepay_link);
          const lenc = linkUrl.searchParams.get('lenc');
          if (lenc) {
            const res = await fetch("https://api.infinitepay.io/invoices/public/checkout/payment_check", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: user.payment_nsu, slug: lenc }),
            });
            if (res.ok) { const data = await res.json(); if (data.paid) paid = true; }
          }
        } catch (e) { console.error('lenc check error:', e); }
      }

      if (paid) {
        const subEnd = await unlockUser();
        const daysRemaining = Math.ceil((new Date(subEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return new Response(JSON.stringify({ success: true, is_paid: true, days_remaining: daysRemaining }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({ success: true, is_paid: false }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({ error: 'Ação não encontrada' }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
