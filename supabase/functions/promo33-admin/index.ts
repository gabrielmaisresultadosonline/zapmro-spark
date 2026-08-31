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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, user_id, status } = await req.json();

    console.log(`[promo33-admin] Action: ${action}`);

    switch (action) {
      case 'list_users': {
        const { data: users, error } = await supabase
          .from('promo33_users')
          .select('id, email, name, phone, instagram_username, subscription_status, subscription_start, subscription_end, created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, users: users || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_status': {
        let updateData: any = { subscription_status: status };
        
        if (status === 'active') {
          const subscriptionEnd = new Date();
          subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);
          updateData.subscription_start = new Date().toISOString();
          updateData.subscription_end = subscriptionEnd.toISOString();
        }

        const { error } = await supabase
          .from('promo33_users')
          .update(updateData)
          .eq('id', user_id);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete_user': {
        const { error } = await supabase
          .from('promo33_users')
          .delete()
          .eq('id', user_id);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, message: 'Ação não reconhecida' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('[promo33-admin] Error:', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
