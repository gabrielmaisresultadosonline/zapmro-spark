import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const callAdmin = async (supabase: any, action: string, req: Request) => {
  const url = new URL(req.url);
  const isFormData = req.headers.get('content-type')?.includes('multipart/form-data');

  // Login
  if (action === 'login') {
    const { email, password } = await req.json();
    const { data: settings } = await supabase.from('promptsin_settings').select('*').limit(1).single();
    if (!settings || email !== settings.admin_email || password !== settings.admin_password) {
      return { error: 'Invalid credentials' };
    }
    return { success: true };
  }

  // Get users
  if (action === 'get-users') {
    const { data: users } = await supabase
      .from('promptsin_users')
      .select('id, name, email, status, last_access, created_at, is_paid, subscription_end')
      .order('created_at', { ascending: false });
    return { users: users || [] };
  }

  // Get orders
  if (action === 'get-orders') {
    const { data: orders } = await supabase
      .from('promptsin_orders')
      .select('*')
      .order('created_at', { ascending: false });
    return { orders: orders || [] };
  }

  // Toggle user
  if (action === 'toggle-user') {
    const { id, status } = await req.json();
    await supabase.from('promptsin_users').update({ status }).eq('id', id);
    return { success: true };
  }

  // Delete user
  if (action === 'delete-user') {
    const { id } = await req.json();
    await supabase.from('promptsin_users').delete().eq('id', id);
    return { success: true };
  }

  // Grant plan
  if (action === 'grant-plan') {
    const { user_id, plan_type } = await req.json();
    const planDays = plan_type === 'mensal' ? 30 : 365;
    const subscriptionEnd = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('promptsin_users').update({
      is_paid: true, paid_at: new Date().toISOString(), subscription_end: subscriptionEnd,
      plan_type: plan_type === 'mensal' ? 'monthly' : 'annual',
    }).eq('id', user_id);
    return { success: true };
  }

  // Mark order paid
  if (action === 'mark-order-paid') {
    const { id } = await req.json();
    const { data: order } = await supabase.from('promptsin_orders').select('*').eq('id', id).single();
    if (!order) return { error: 'Order not found' };

    await supabase.from('promptsin_orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);

    // Unlock user
    const isMonthly = order.plan_type === 'monthly';
    const planDays = isMonthly ? 30 : 365;
    const subscriptionEnd = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: user } = await supabase.from('promptsin_users').select('id').eq('email', order.email).maybeSingle();
    if (user) {
      await supabase.from('promptsin_users').update({
        is_paid: true, paid_at: new Date().toISOString(), subscription_end: subscriptionEnd,
      }).eq('id', user.id);
    }

    return { success: true };
  }

  // Delete order
  if (action === 'delete-order') {
    const { id } = await req.json();
    await supabase.from('promptsin_orders').delete().eq('id', id);
    return { success: true };
  }

  return { error: 'Action not found' };
};

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
    if (!action) {
      return new Response(JSON.stringify({ error: 'No action provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = await callAdmin(supabase, action, req);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
