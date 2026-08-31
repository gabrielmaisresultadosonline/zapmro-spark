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
    
    // Create service client for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, data } = await req.json();
    
    // Admin data is stored as a single file
    const filePath = 'admin/sync-data.json';
    console.log(`[admin-data-storage] Action: ${action}`);

    if (action === 'save') {
      // Save admin sync data as JSON file
      if (!data) {
        return new Response(
          JSON.stringify({ success: false, error: 'Data is required for save action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const jsonData = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });

      // Upload/update the file using service client
      const { error: uploadError } = await supabaseAdmin.storage
        .from('user-data')
        .upload(filePath, blob, {
          contentType: 'application/json',
          upsert: true
        });

      if (uploadError) {
        console.error('[admin-data-storage] Upload error:', uploadError);
        return new Response(
          JSON.stringify({ success: false, error: uploadError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[admin-data-storage] Admin data saved successfully: ${data.profiles?.length || 0} profiles`);
      return new Response(
        JSON.stringify({ success: true, message: 'Admin data saved successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'load') {
      // Load admin sync data from JSON file using service client
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('user-data')
        .download(filePath);

      if (downloadError) {
        // File doesn't exist yet - return empty data
        if (downloadError.message.includes('not found') || downloadError.message.includes('Object not found')) {
          console.log(`[admin-data-storage] No admin data found`);
          return new Response(
            JSON.stringify({ success: true, data: null, exists: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.error('[admin-data-storage] Download error:', downloadError);
        return new Response(
          JSON.stringify({ success: false, error: downloadError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const text = await fileData.text();
      const adminData = JSON.parse(text);
      
      console.log(`[admin-data-storage] Admin data loaded successfully: ${adminData.profiles?.length || 0} profiles`);
      return new Response(
        JSON.stringify({ success: true, data: adminData, exists: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action. Use: save or load' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[admin-data-storage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
