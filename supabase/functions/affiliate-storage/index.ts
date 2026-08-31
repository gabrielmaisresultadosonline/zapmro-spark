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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, data, key } = await req.json();
    
    const filePath = key === 'settings' ? 'admin/affiliate-settings.json' : 'admin/affiliates.json';
    console.log(`[affiliate-storage] Action: ${action}, Key: ${key || 'affiliates'}`);

    if (action === 'save') {
      if (!data) {
        return new Response(
          JSON.stringify({ success: false, error: 'Data is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const { error } = await supabaseAdmin.storage
        .from('user-data')
        .upload(filePath, blob, { contentType: 'application/json', upsert: true });

      if (error) {
        console.error('[affiliate-storage] Upload error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`[affiliate-storage] Saved successfully`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'load') {
      const { data: fileData, error } = await supabaseAdmin.storage
        .from('user-data')
        .download(filePath);

      if (error) {
        if (error.message.includes('not found') || error.message.includes('Object not found')) {
          return new Response(
            JSON.stringify({ success: true, data: key === 'settings' ? {} : [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const text = await fileData.text();
      const parsed = JSON.parse(text);
      return new Response(
        JSON.stringify({ success: true, data: parsed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
  } catch (error) {
    console.error('[affiliate-storage] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
