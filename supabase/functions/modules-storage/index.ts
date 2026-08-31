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

    const { action, data, platform, isBackup } = await req.json();
    
    // Modules data is stored as separate files per platform
    // MRO uses the original path for backward compatibility
    const getBaseName = (p: string) => {
      if (p === 'zapmro') return 'zapmro-modules-data';
      if (p === 'estrutura') return 'estrutura-modules-data';
      return 'modules-data'; // default = mro
    };
    const baseName = getBaseName(platform || 'mro');
    const filePath = isBackup ? `admin/${baseName}-backup.json` : `admin/${baseName}.json`;
    const callSettingsPath = 'admin/call-settings.json';
    
    console.log(`[modules-storage] Action: ${action}, Platform: ${platform || 'mro'}, Path: ${filePath}, Backup: ${isBackup || false}`);

    if (action === 'save') {
      // Save modules data as JSON file
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
        console.error('[modules-storage] Upload error:', uploadError);
        return new Response(
          JSON.stringify({ success: false, error: uploadError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[modules-storage] Modules saved: ${data.modules?.length || 0} modules`);
      return new Response(
        JSON.stringify({ success: true, message: 'Modules saved successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'load') {
      // Load modules data from JSON file using service client
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('user-data')
        .download(filePath);

      if (downloadError) {
        const msg = `${(downloadError as any)?.message ?? ''}`.toLowerCase();
        const errStr = `${(downloadError as any)?.error ?? ''}`.toLowerCase();
        const status = (downloadError as any)?.statusCode ?? (downloadError as any)?.status;

        // File doesn't exist yet - return empty data
        if (status === 404 || msg.includes('not found') || msg.includes('object not found') || errStr.includes('not found')) {
          console.log(`[modules-storage] No modules data found`);
          return new Response(
            JSON.stringify({ success: true, data: null, exists: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.error('[modules-storage] Download error:', downloadError);
        return new Response(
          JSON.stringify({ success: false, error: (downloadError as any)?.message ?? String(downloadError) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const text = await fileData.text();
      const modulesData = JSON.parse(text);
      
      console.log(`[modules-storage] Modules loaded: ${modulesData.modules?.length || 0} modules`);
      return new Response(
        JSON.stringify({ success: true, data: modulesData, exists: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'save-call-settings') {
      // Save call page settings to cloud
      if (!data) {
        return new Response(
          JSON.stringify({ success: false, error: 'Data is required for save-call-settings action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const jsonData = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });

      const { error: uploadError } = await supabaseAdmin.storage
        .from('user-data')
        .upload(callSettingsPath, blob, {
          contentType: 'application/json',
          upsert: true
        });

      if (uploadError) {
        console.error('[modules-storage] Call settings upload error:', uploadError);
        return new Response(
          JSON.stringify({ success: false, error: uploadError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[modules-storage] Call settings saved successfully`);
      return new Response(
        JSON.stringify({ success: true, message: 'Call settings saved successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'load-call-settings') {
      // Load call page settings from cloud
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('user-data')
        .download(callSettingsPath);

      if (downloadError) {
        if (downloadError.message.includes('not found') || downloadError.message.includes('Object not found')) {
          console.log(`[modules-storage] No call settings found, returning defaults`);
          return new Response(
            JSON.stringify({ success: true, data: null, exists: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.error('[modules-storage] Call settings download error:', downloadError);
        return new Response(
          JSON.stringify({ success: false, error: downloadError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const text = await fileData.text();
      const callSettingsData = JSON.parse(text);
      
      console.log(`[modules-storage] Call settings loaded successfully`);
      return new Response(
        JSON.stringify({ success: true, data: callSettingsData, exists: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action. Use: save, load, save-call-settings, or load-call-settings' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[modules-storage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});