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

    const { action, squarecloud_username, reports } = await req.json();
    
    console.log(`[report-storage] Action: ${action}, User: ${squarecloud_username}`);

    if (!squarecloud_username) {
      return new Response(
        JSON.stringify({ success: false, error: 'squarecloud_username is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const bucketName = 'user-data';
    const filePath = `reports/${squarecloud_username.toLowerCase()}/reports.json`;

    if (action === 'save') {
      if (!reports) {
        return new Response(
          JSON.stringify({ success: false, error: 'reports data is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const jsonData = JSON.stringify(reports);
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, jsonData, {
          contentType: 'application/json',
          upsert: true,
        });

      if (error) {
        console.error('[report-storage] Save error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`[report-storage] Saved ${Object.keys(reports).length} reports for ${squarecloud_username}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'load') {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(filePath);

      if (error) {
        // File doesn't exist yet - return empty
        if (error.message.includes('not found') || error.message.includes('Object not found')) {
          return new Response(
            JSON.stringify({ success: true, reports: {} }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.error('[report-storage] Load error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const text = await data.text();
      const parsedReports = JSON.parse(text);
      
      console.log(`[report-storage] Loaded reports for ${squarecloud_username}`);
      return new Response(
        JSON.stringify({ success: true, reports: parsedReports }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action. Use: save or load' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

  } catch (error) {
    console.error('[report-storage] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
