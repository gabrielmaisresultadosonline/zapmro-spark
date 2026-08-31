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
    const { action, username, squarecloud_username, image_base64, content_type, screenshot_url } = await req.json();

    if (!username || !squarecloud_username) {
      return Response.json(
        { success: false, error: 'Dados obrigatórios faltando' },
        { status: 400, headers: corsHeaders }
      );
    }

    const normalizedUsername = String(username).toLowerCase().replace('@', '').trim();
    const normalizedSquarecloudUsername = String(squarecloud_username).toLowerCase().trim();

    console.log(`📸 Uploading profile screenshot for @${normalizedUsername} (user: ${normalizedSquarecloudUsername})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'set' || action === 'clear') {
      const nextUrl = action === 'set' ? String(screenshot_url || '') || null : null;

      const { error: updateError } = await supabase
        .from('squarecloud_user_profiles')
        .update({ 
          profile_screenshot_url: nextUrl,
          updated_at: new Date().toISOString()
        })
        .eq('squarecloud_username', normalizedSquarecloudUsername)
        .eq('instagram_username', normalizedUsername);

      if (updateError) {
        console.error('❌ Screenshot restore/clear error:', updateError);
        return Response.json(
          { success: false, error: updateError.message },
          { status: 500, headers: corsHeaders }
        );
      }

      return Response.json(
        { success: true, url: nextUrl, message: action === 'set' ? 'Screenshot restaurado' : 'Screenshot removido' },
        { headers: corsHeaders }
      );
    }

    if (!image_base64) {
      return Response.json(
        { success: false, error: 'Imagem obrigatória para upload' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Convert base64 to Uint8Array
    const binaryString = atob(image_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine file extension
    const extension = content_type?.includes('png') ? 'png' : 
                     content_type?.includes('webp') ? 'webp' : 'jpg';

    // Create unique filename
    const timestamp = Date.now();
    const filePath = `screenshots/${normalizedSquarecloudUsername}/${normalizedUsername}_${timestamp}.${extension}`;

    // Upload to storage bucket (profile-cache)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile-cache')
      .upload(filePath, bytes, {
        contentType: content_type || 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('profile-cache')
      .getPublicUrl(filePath);

    const screenshotUrl = publicUrlData.publicUrl;
    console.log(`✅ Screenshot uploaded: ${screenshotUrl}`);

    // Update the profile record with screenshot URL
    const { error: updateError } = await supabase
      .from('squarecloud_user_profiles')
      .update({ 
        profile_screenshot_url: screenshotUrl,
        updated_at: new Date().toISOString()
      })
      .eq('squarecloud_username', normalizedSquarecloudUsername)
      .eq('instagram_username', normalizedUsername);

    if (updateError) {
      console.warn('⚠️ Could not update profile record:', updateError);
      // Don't fail - screenshot was uploaded successfully
    }

    return Response.json({
      success: true,
      url: screenshotUrl,
      message: 'Screenshot enviado com sucesso'
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ Error uploading screenshot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar screenshot';
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
});
