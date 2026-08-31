import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Auth check
    if (action === 'login') {
      const { email, password } = await req.json();
      const { data: settings } = await supabase
        .from('prompts_mro_settings')
        .select('*')
        .single();

      if (!settings || settings.admin_email !== email || settings.admin_password !== password) {
        return new Response(JSON.stringify({ error: 'Credenciais inválidas' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upload single image to storage
    if (action === 'upload-image') {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const folder = formData.get('folder') as string;
      
      if (!file) {
        return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const arrayBuffer = await file.arrayBuffer();
      const ext = file.name.split('.').pop() || 'png';
      const storagePath = `prompts/${Date.now()}_${(folder || 'img').replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('assets')
        .upload(storagePath, new Uint8Array(arrayBuffer), {
          contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });

      if (uploadError) {
        return new Response(JSON.stringify({ error: uploadError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath);
      return new Response(JSON.stringify({ url: urlData.publicUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert single prompt
    if (action === 'insert-prompt') {
      const { folder_name, prompt_text, image_url, category } = await req.json();

      // Get current max order_index
      const { data: existingItems } = await supabase
        .from('prompts_mro_items')
        .select('order_index')
        .order('order_index', { ascending: false })
        .limit(1);
      
      let orderIndex = 0;
      if (existingItems && existingItems.length > 0) {
        orderIndex = existingItems[0].order_index + 1;
      }

      const { error } = await supabase.from('prompts_mro_items').insert({
        folder_name,
        prompt_text,
        image_url,
        order_index: orderIndex,
        is_active: true,
        category: category || 'geral',
      });

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get all prompts
    if (action === 'get-prompts') {
      const { data, error } = await supabase
        .from('prompts_mro_items')
        .select('*')
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      return new Response(JSON.stringify({ prompts: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Delete prompt
    if (action === 'delete-prompt') {
      const { id } = await req.json();
      await supabase.from('prompts_mro_items').delete().eq('id', id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Delete all prompts
    if (action === 'delete-all-prompts') {
      await supabase.from('prompts_mro_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Delete prompts by category
    if (action === 'delete-prompts-by-category') {
      const { category } = body;
      await supabase.from('prompts_mro_items').delete().eq('category', category);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Toggle prompt active
    if (action === 'toggle-prompt') {
      const { id, is_active } = await req.json();
      await supabase.from('prompts_mro_items').update({ is_active }).eq('id', id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update prompt text/category/folder_name
    if (action === 'update-prompt') {
      const { id, prompt_text, category, folder_name } = await req.json();
      const updates: Record<string, any> = {};
      if (prompt_text !== undefined) updates.prompt_text = prompt_text;
      if (category !== undefined) updates.category = category;
      if (folder_name !== undefined) updates.folder_name = folder_name;
      
      const { error } = await supabase.from('prompts_mro_items').update(updates).eq('id', id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update prompt image
    if (action === 'update-prompt-image') {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const id = formData.get('id') as string;
      
      if (!file || !id) {
        return new Response(JSON.stringify({ error: 'Missing file or id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const arrayBuffer = await file.arrayBuffer();
      const ext = file.name.split('.').pop() || 'png';
      const storagePath = `prompts/${Date.now()}_edit_${id.slice(0, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(storagePath, new Uint8Array(arrayBuffer), {
          contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });

      if (uploadError) {
        return new Response(JSON.stringify({ error: uploadError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath);
      await supabase.from('prompts_mro_items').update({ image_url: urlData.publicUrl }).eq('id', id);

      return new Response(JSON.stringify({ success: true, url: urlData.publicUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get users
    if (action === 'get-users') {
      const { data, error } = await supabase
        .from('prompts_mro_users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return new Response(JSON.stringify({ users: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Toggle user status
    if (action === 'toggle-user') {
      const { id, status } = await req.json();
      await supabase.from('prompts_mro_users').update({ status }).eq('id', id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Delete user
    if (action === 'delete-user') {
      const { id } = await req.json();
      await supabase.from('prompts_mro_users').delete().eq('id', id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get orders (from prompts_mro_payment_orders + join user info)
    if (action === 'get-orders') {
      const { data, error } = await supabase
        .from('prompts_mro_payment_orders')
        .select('*, user:prompts_mro_users(name, email, is_paid, subscription_end)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Auto-expire pending orders past their expired_at
      const now = new Date();
      const updated = (data || []).map(order => {
        if (order.status === 'pending' && order.expired_at && new Date(order.expired_at) < now) {
          supabase.from('prompts_mro_payment_orders').update({ status: 'expired' }).eq('id', order.id);
          return { ...order, status: 'expired' };
        }
        return order;
      });

      return new Response(JSON.stringify({ orders: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mark order as paid manually + activate user
    if (action === 'mark-order-paid') {
      const { id } = await req.json();
      
      // Get order details
      const { data: order } = await supabase
        .from('prompts_mro_payment_orders')
        .select('*')
        .eq('id', id)
        .single();

      if (!order) throw new Error('Pedido não encontrado');

      await supabase.from('prompts_mro_payment_orders').update({ 
        status: 'paid', 
        paid_at: new Date().toISOString() 
      }).eq('id', id);

      // Activate user if linked
      if (order.user_id) {
        const subEnd = new Date();
        subEnd.setDate(subEnd.getDate() + 365);
        await supabase.from('prompts_mro_users').update({ 
          is_paid: true,
          paid_at: new Date().toISOString(),
          subscription_end: subEnd.toISOString(),
          status: 'active'
        }).eq('id', order.user_id);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Delete order
    if (action === 'delete-order') {
      const { id } = await req.json();
      await supabase.from('prompts_mro_payment_orders').delete().eq('id', id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resend access email
    if (action === 'resend-email') {
      const { user_id } = await req.json();
      const { data: user } = await supabase
        .from('prompts_mro_users')
        .select('*')
        .eq('id', user_id)
        .single();

      if (!user) throw new Error('Usuário não encontrado');

      const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD');
      if (!SMTP_PASSWORD) throw new Error('SMTP not configured');

      const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
      const client = new SMTPClient({
        connection: {
          hostname: "smtp.hostinger.com",
          port: 465,
          tls: true,
          auth: { username: "suporte@maisresultadosonline.com.br", password: SMTP_PASSWORD },
        },
      });

      const isPaid = user.is_paid;
      const daysLeft = user.subscription_end ? Math.max(0, Math.ceil((new Date(user.subscription_end).getTime() - Date.now()) / (1000*60*60*24))) : 0;

      const subject = isPaid ? '🎉 Seu acesso COMPLETO ao Prompts MRO' : '✅ Seus dados de acesso - Prompts MRO';
      const html = `
        <div style="font-family:Arial;max-width:600px;margin:0 auto;background:#0a0a0f;color:#fff;padding:30px;border-radius:16px;">
          <h1 style="color:#22c55e;text-align:center;">${isPaid ? '🎉 Acesso Completo Liberado!' : '✅ Seus dados de acesso'}</h1>
          <div style="background:#111;padding:20px;border-radius:12px;margin:20px 0;">
            <p><strong>Nome:</strong> ${user.name}</p>
            <p><strong>E-mail:</strong> ${user.email}</p>
            <p><strong>Senha:</strong> ${user.password}</p>
            ${isPaid ? `<p><strong>Acesso:</strong> Ilimitado por 1 ano (${daysLeft} dias restantes)</p>` : '<p><strong>Créditos:</strong> 5 cópias gratuitas</p>'}
          </div>
          <div style="text-align:center;margin:20px 0;">
            <a href="https://prompt.maisresultadosonline.com.br" style="background:#22c55e;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Acessar Plataforma</a>
          </div>
        </div>
      `;

      await client.send({
        from: "Prompts MRO <suporte@maisresultadosonline.com.br>",
        to: user.email,
        subject,
        html,
      });
      await client.close();

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Grant plan manually to a user
    if (action === 'grant-plan') {
      const { user_id, plan_type } = await req.json();
      if (!user_id || !plan_type) throw new Error('user_id e plan_type são obrigatórios');

      const days = plan_type === 'mensal' ? 30 : 365;
      const subEnd = new Date();
      subEnd.setDate(subEnd.getDate() + days);

      const { error } = await supabase.from('prompts_mro_users').update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        subscription_end: subEnd.toISOString(),
        copies_limit: 999999,
        status: 'active',
      }).eq('id', user_id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, plan_type, days }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
