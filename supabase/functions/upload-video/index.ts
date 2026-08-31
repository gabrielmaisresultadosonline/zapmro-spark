import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const contentType = req.headers.get('content-type') || '';
    
    // Handle multipart form data
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const folder = formData.get('folder') as string || 'videos';
      const filename = formData.get('filename') as string || `${Date.now()}_${file?.name || 'video.mp4'}`;

      if (!file) {
        console.error('[upload-video] No file provided');
        return new Response(
          JSON.stringify({ success: false, error: 'No file provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check file size (max 100MB)
      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        console.error('[upload-video] File too large:', file.size);
        return new Response(
          JSON.stringify({ success: false, error: 'File too large. Maximum size is 100MB.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check file type
      const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'application/octet-stream'];
      const fileExt = file.name?.toLowerCase().split('.').pop() || '';
      const allowedExts = ['mp4', 'webm', 'mov', 'avi'];
      
      if (!allowedTypes.includes(file.type) && !allowedExts.includes(fileExt)) {
        console.error('[upload-video] Invalid file type:', file.type);
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid file type. Allowed: MP4, WebM, MOV, AVI' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const filePath = `${folder}/${filename}`;
      console.log(`[upload-video] Uploading file: ${filePath}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

      // For smaller files (under 25MB), use direct upload
      if (file.size < 25 * 1024 * 1024) {
        const arrayBuffer = await file.arrayBuffer();
        const { data, error } = await supabase.storage
          .from('assets')
          .upload(filePath, arrayBuffer, {
            contentType: file.type || 'video/mp4',
            upsert: true,
          });

        if (error) {
          console.error('[upload-video] Upload error:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        const { data: { publicUrl } } = supabase.storage
          .from('assets')
          .getPublicUrl(filePath);

        console.log(`[upload-video] Upload successful: ${publicUrl}`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            url: publicUrl,
            path: filePath,
            size: file.size,
            type: file.type
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // For larger files, use streaming with Uint8Array chunks
      console.log('[upload-video] Large file detected, using chunked upload...');
      
      // Read file as stream and process in chunks
      const reader = file.stream().getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.length;
        
        // Log progress every 10MB
        if (totalBytes % (10 * 1024 * 1024) < value.length) {
          console.log(`[upload-video] Read ${(totalBytes / 1024 / 1024).toFixed(2)}MB...`);
        }
      }

      // Combine chunks into single Uint8Array
      const combinedArray = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }

      console.log(`[upload-video] File read complete, uploading ${(totalBytes / 1024 / 1024).toFixed(2)}MB...`);

      const { data, error } = await supabase.storage
        .from('assets')
        .upload(filePath, combinedArray, {
          contentType: file.type || 'video/mp4',
          upsert: true,
        });

      if (error) {
        console.error('[upload-video] Upload error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const { data: { publicUrl } } = supabase.storage
        .from('assets')
        .getPublicUrl(filePath);

      console.log(`[upload-video] Upload successful: ${publicUrl}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          url: publicUrl,
          path: filePath,
          size: file.size,
          type: file.type
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid content type' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[upload-video] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});