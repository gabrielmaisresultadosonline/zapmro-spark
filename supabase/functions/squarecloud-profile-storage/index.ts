import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, squarecloud_username, instagram_username, profile_data } = await req.json();
    
    console.log(`[squarecloud-profile-storage] Action: ${action}, User: ${squarecloud_username}`);

    if (!squarecloud_username) {
      return new Response(
        JSON.stringify({ success: false, error: 'squarecloud_username is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (action === 'save') {
      // Save or update Instagram profile for this SquareCloud user
      if (!instagram_username || !profile_data) {
        return new Response(
          JSON.stringify({ success: false, error: 'instagram_username and profile_data are required for save' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('squarecloud_user_profiles')
        .upsert({
          squarecloud_username: squarecloud_username.toLowerCase(),
          instagram_username: instagram_username.toLowerCase(),
          profile_data,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'squarecloud_username,instagram_username'
        })
        .select()
        .single();

      if (error) {
        console.error('[squarecloud-profile-storage] Save error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`[squarecloud-profile-storage] Saved profile @${instagram_username} for ${squarecloud_username}`);
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'load') {
      // Load all Instagram profiles for this SquareCloud user
      const { data, error } = await supabase
        .from('squarecloud_user_profiles')
        .select('*')
        .eq('squarecloud_username', squarecloud_username.toLowerCase())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[squarecloud-profile-storage] Load error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`[squarecloud-profile-storage] Loaded ${data?.length || 0} profiles for ${squarecloud_username}`);
      return new Response(
        JSON.stringify({ success: true, profiles: data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'delete') {
      // Delete a specific Instagram profile
      if (!instagram_username) {
        return new Response(
          JSON.stringify({ success: false, error: 'instagram_username is required for delete' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error } = await supabase
        .from('squarecloud_user_profiles')
        .delete()
        .eq('squarecloud_username', squarecloud_username.toLowerCase())
        .eq('instagram_username', instagram_username.toLowerCase());

      if (error) {
        console.error('[squarecloud-profile-storage] Delete error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`[squarecloud-profile-storage] Deleted profile @${instagram_username} for ${squarecloud_username}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action. Use: save, load, or delete' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

  } catch (error) {
    console.error('[squarecloud-profile-storage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
