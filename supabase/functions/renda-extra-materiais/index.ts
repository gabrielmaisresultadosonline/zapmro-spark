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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, email, password, data } = await req.json();

    // Public action: list materials
    if (action === 'list') {
      const { data: materiais, error } = await supabase
        .from('renda_extra_materiais')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, materiais }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin actions require auth
    if (email !== 'mro@gmail.com' || password !== 'Ga145523@') {
      return new Response(JSON.stringify({ success: false, error: 'Credenciais inválidas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
      });
    }

    if (action === 'login') {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'admin-list') {
      const { data: materiais, error } = await supabase
        .from('renda_extra_materiais')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, materiais }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save') {
      // data is { title, video_url, file_name, file_size }
      const { error } = await supabase.from('renda_extra_materiais').insert({
        title: data.title || '',
        video_url: data.video_url,
        file_name: data.file_name,
        file_size: data.file_size || 0,
        order_index: data.order_index || 0,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update') {
      const { error } = await supabase
        .from('renda_extra_materiais')
        .update({ title: data.title, updated_at: new Date().toISOString() })
        .eq('id', data.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { error } = await supabase
        .from('renda_extra_materiais')
        .delete()
        .eq('id', data.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Ação inválida' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
