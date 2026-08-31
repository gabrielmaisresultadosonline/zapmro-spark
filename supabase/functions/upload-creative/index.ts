import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

    const { action, username, creativeId, imageBase64, auth_token } = await req.json();
    
    console.log(`🎨 upload-creative: action=${action}, username=${username}, creativeId=${creativeId}`);

    if (!username) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate auth_token for all actions
    if (!auth_token || typeof auth_token !== 'string' || auth_token.length < 20) {
      console.log(`🔒 upload-creative: Invalid or missing auth_token for ${username}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or missing auth_token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify auth_token format: username_timestamp_random
    const tokenParts = auth_token.split('_');
    if (tokenParts.length < 3) {
      console.log(`🔒 upload-creative: Invalid auth_token format for ${username}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid auth_token format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify username in token matches requested username
    const tokenUsername = tokenParts[0].toLowerCase();
    if (tokenUsername !== username.toLowerCase()) {
      console.log(`🔒 upload-creative: Username mismatch - token: ${tokenUsername}, request: ${username}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Username mismatch in auth_token' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ upload-creative: Auth verified for ${username}`);

    // UPLOAD - Upload creative image to storage
    if (action === 'upload') {
      if (!imageBase64 || !creativeId) {
        return new Response(
          JSON.stringify({ success: false, error: 'imageBase64 and creativeId are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract base64 data and content type
      let base64Data = imageBase64;
      let contentType = 'image/png';
      
      if (imageBase64.startsWith('data:')) {
        const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentType = match[1];
          base64Data = match[2];
        }
      }

      // Convert base64 to Uint8Array
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Generate unique file path - use assets bucket (public)
      const timestamp = Date.now();
      const fileName = `creatives/${username.toLowerCase()}/${creativeId}_${timestamp}.png`;

      // Upload to storage (assets bucket is public)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, bytes, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Error uploading creative:', uploadError);
        return new Response(
          JSON.stringify({ success: false, error: uploadError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get public URL (assets bucket is public)
      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(fileName);

      console.log(`🎨 Creative uploaded: ${fileName}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          url: urlData.publicUrl,
          path: fileName 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE - Delete expired creative from storage
    if (action === 'delete') {
      if (!creativeId) {
        return new Response(
          JSON.stringify({ success: false, error: 'creativeId is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // List files for this user's creative
      const { data: files } = await supabase.storage
        .from('assets')
        .list(`creatives/${username.toLowerCase()}`, {
          search: creativeId,
        });

      if (files && files.length > 0) {
        const filePaths = files.map(f => `creatives/${username.toLowerCase()}/${f.name}`);
        const { error: deleteError } = await supabase.storage
          .from('assets')
          .remove(filePaths);

        if (deleteError) {
          console.error('Error deleting creative:', deleteError);
        } else {
          console.log(`🗑️ Deleted creative files: ${filePaths.join(', ')}`);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upload-creative:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
