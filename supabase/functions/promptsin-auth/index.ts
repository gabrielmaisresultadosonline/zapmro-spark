import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "_promptsin_salt_2025");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
        return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: user, error } = await supabase
        .from('promptsin_users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .eq('status', 'active')
        .maybeSingle();

      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Email not found or account inactive' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let passwordMatch = false;
      const hashedInput = await hashPassword(password);
      if (user.password === hashedInput) {
        passwordMatch = true;
      } else if (user.password === password) {
        passwordMatch = true;
        await supabase.from('promptsin_users').update({ password: hashedInput }).eq('id', user.id);
      }

      if (!passwordMatch) {
        return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await supabase.from('promptsin_users').update({ last_access: new Date().toISOString() }).eq('id', user.id);

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

    // Register
    if (action === 'register') {
      const { name, email, password, phone } = await req.json();
      if (!name || !email || !password) {
        return new Response(JSON.stringify({ error: 'Name, email and password are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const { data: existing } = await supabase.from('promptsin_users').select('id').eq('email', normalizedEmail).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: 'This email is already registered. Please login.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const hashedPassword = await hashPassword(password);
      const { data: newUser, error: insertError } = await supabase
        .from('promptsin_users')
        .insert({
          name: name.trim(), email: normalizedEmail, password: hashedPassword,
          phone: phone ? phone.trim() : null, status: 'active',
          last_access: new Date().toISOString(), copies_count: 0, copies_limit: 5, is_paid: false,
        })
        .select('id, name, email, copies_count, copies_limit, is_paid')
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Error creating account' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: true,
        user: { id: newUser.id, name: newUser.name, email: newUser.email, copies_count: newUser.copies_count, copies_limit: newUser.copies_limit, is_paid: newUser.is_paid }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get prompts (same content from prompts_mro_items)
    if (action === 'get-prompts') {
      const { data: prompts, error } = await supabase
        .from('prompts_mro_items')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ prompts: prompts || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Track copy
    if (action === 'track-copy') {
      const { user_id } = await req.json();
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: user, error } = await supabase.from('promptsin_users').select('id, copies_count, copies_limit, is_paid').eq('id', user_id).single();
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (user.is_paid) {
        return new Response(JSON.stringify({ success: true, copies_count: user.copies_count, copies_limit: user.copies_limit, is_paid: true, blocked: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const newCount = (user.copies_count || 0) + 1;
      const blocked = newCount >= (user.copies_limit || 5);
      await supabase.from('promptsin_users').update({ copies_count: newCount }).eq('id', user_id);

      return new Response(JSON.stringify({ success: true, copies_count: newCount, copies_limit: user.copies_limit || 5, is_paid: false, blocked }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // User status
    if (action === 'user-status') {
      const { user_id } = await req.json();
      const { data: user } = await supabase.from('promptsin_users').select('id, copies_count, copies_limit, is_paid, subscription_end').eq('id', user_id).single();
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    // Create Stripe payment
    if (action === 'create-payment') {
      const { user_id, plan_type } = await req.json();
      const { data: user } = await supabase.from('promptsin_users').select('id, email, name').eq('id', user_id).single();
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      const selectedPlan = plan_type === 'monthly' ? 'monthly' : 'annual';
      const amount = selectedPlan === 'monthly' ? 1990 : 9700; // cents
      const planLabel = selectedPlan === 'monthly' ? 'Monthly' : 'Annual';

      const origin = req.headers.get('origin') || 'https://ig-mro-boost.lovable.app';

      const session = await stripe.checkout.sessions.create({
        customer_email: user.email,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `AI Prompts PRO - ${planLabel} Plan` },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${origin}/promptsin/dashboard?paid=true`,
        cancel_url: `${origin}/promptsin/dashboard`,
        metadata: {
          user_id: user.id,
          plan_type: selectedPlan,
          platform: 'promptsin',
        },
      });

      // Create order record
      await supabase.from('promptsin_orders').insert({
        email: user.email, name: user.name, amount: selectedPlan === 'monthly' ? 19.90 : 97,
        plan_type: selectedPlan, status: 'pending', stripe_session_id: session.id,
      });

      return new Response(JSON.stringify({ success: true, payment_link: session.url, session_id: session.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check Stripe payment
    if (action === 'check-payment') {
      const { user_id } = await req.json();
      const { data: user } = await supabase.from('promptsin_users').select('id, email, name, is_paid, subscription_end').eq('id', user_id).single();
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (user.is_paid) {
        let daysRemaining: number | null = null;
        if (user.subscription_end) {
          daysRemaining = Math.ceil((new Date(user.subscription_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        }
        return new Response(JSON.stringify({ success: true, is_paid: true, days_remaining: daysRemaining }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check pending orders with Stripe
      const { data: pendingOrders } = await supabase
        .from('promptsin_orders')
        .select('*')
        .eq('email', user.email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!pendingOrders || pendingOrders.length === 0) {
        return new Response(JSON.stringify({ success: true, is_paid: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return new Response(JSON.stringify({ success: true, is_paid: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      for (const order of pendingOrders) {
        if (!order.stripe_session_id) continue;
        try {
          const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
          if (session.payment_status === 'paid' || session.status === 'complete') {
            const isMonthly = order.plan_type === 'monthly';
            const planDays = isMonthly ? 30 : 365;
            const subscriptionEnd = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();

            await supabase.from('promptsin_users').update({
              is_paid: true, paid_at: new Date().toISOString(), subscription_end: subscriptionEnd,
              stripe_session_id: order.stripe_session_id, plan_type: order.plan_type,
            }).eq('id', user.id);

            await supabase.from('promptsin_orders').update({
              status: 'paid', paid_at: new Date().toISOString(), completed_at: new Date().toISOString(),
              stripe_payment_intent: session.payment_intent as string,
            }).eq('id', order.id);

            const daysRemaining = Math.ceil((new Date(subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return new Response(JSON.stringify({ success: true, is_paid: true, days_remaining: daysRemaining }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        } catch (e) {
          console.error('Stripe check error:', e);
        }
      }

      return new Response(JSON.stringify({ success: true, is_paid: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Action not found' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
