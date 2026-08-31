import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create service client for storage operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[load-admin-data] Loading admin sync data...');
    
    const filePath = 'admin/sync-data.json';
    
    // Load admin sync data from JSON file
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('user-data')
      .download(filePath);

    if (downloadError) {
      // File doesn't exist yet - return empty data
      if (downloadError.message.includes('not found') || downloadError.message.includes('Object not found')) {
        console.log('[load-admin-data] No admin data found');
        return new Response(
          JSON.stringify({ success: true, data: null, exists: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.error('[load-admin-data] Download error:', downloadError);
      return new Response(
        JSON.stringify({ success: false, error: downloadError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = await fileData.text();
    const adminData = JSON.parse(text);
    
    console.log(`[load-admin-data] Admin data loaded: ${adminData.profiles?.length || 0} profiles`);
    return new Response(
      JSON.stringify({ success: true, data: adminData, exists: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[load-admin-data] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
