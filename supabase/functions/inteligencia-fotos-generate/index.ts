import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getRetryAfterSeconds(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function getPngDimensionsFromBase64(base64: string): { width: number; height: number } | null {
  try {
    const bin = atob(base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const isPng =
      bytes.length > 24 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    if (!isPng) return null;
    const width = readUint32BE(bytes, 16);
    const height = readUint32BE(bytes, 20);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

async function upscaleImageIfNeeded({
  bytes,
  requestedLongSide,
}: {
  bytes: Uint8Array;
  requestedLongSide: number;
}): Promise<{ bytes: Uint8Array; width: number; height: number; upscaled: boolean }> {
  const img = await Image.decode(bytes);
  const currentLong = Math.max(img.width, img.height);
  if (!requestedLongSide || currentLong >= requestedLongSide) {
    return { bytes, width: img.width, height: img.height, upscaled: false };
  }
  const scale = requestedLongSide / currentLong;
  const nextW = Math.max(1, Math.round(img.width * scale));
  const nextH = Math.max(1, Math.round(img.height * scale));
  const resized = img.resize(nextW, nextH);
  const out = await resized.encode();
  return { bytes: out, width: nextW, height: nextH, upscaled: true };
}

// Upload file to Google Files API and return file_uri
async function uploadToGoogleFilesAPI(
  fileBytes: Uint8Array,
  mimeType: string,
  apiKey: string
): Promise<{ uri: string; mimeType: string }> {
  const fileSize = fileBytes.length;
  const displayName = `user-photo-${Date.now()}`;

  // Step 1: Start resumable upload
  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileSize),
        "X-Goog-Upload-Header-Content-Type": mimeType,
      },
      body: JSON.stringify({
        file: { display_name: displayName },
      }),
    }
  );

  if (!startResponse.ok) {
    const errText = await startResponse.text();
    throw new Error(`Failed to start upload: ${startResponse.status} - ${errText}`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("No upload URL returned from Google Files API");
  }

  // Step 2: Upload the file data
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(fileBytes) as unknown as BodyInit,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errText}`);
  }

  const result = await uploadResponse.json();
  console.log("Google Files API upload result:", JSON.stringify(result));

  if (!result.file?.uri) {
    throw new Error("No file URI returned from Google Files API");
  }

  return { uri: result.file.uri, mimeType: result.file.mimeType || mimeType };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { templateId, inputImageUrl, userId, format } = await req.json();

    if (!templateId || !inputImageUrl || !userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Dados incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Google Gemini API key from settings
    const { data: apiKeySetting, error: settingError } = await supabase
      .from("inteligencia_fotos_settings")
      .select("setting_value")
      .eq("setting_key", "google_gemini_api_key")
      .single();

    if (settingError || !apiKeySetting?.setting_value) {
      console.error("API key not configured:", settingError);
      return new Response(
        JSON.stringify({ success: false, error: "API key do Google Gemini não configurada. Configure nas configurações do admin." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiApiKey = apiKeySetting.setting_value;

    // Get template with prompt
    const { data: template, error: templateError } = await supabase
      .from("inteligencia_fotos_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ success: false, error: "Template não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine dimensions based on format - HIGH QUALITY 1K-2K
    const dimensions =
      format === "stories"
        ? { width: 1080, height: 1920 } // 1K Stories (Full HD vertical)
        : { width: 2048, height: 1638 }; // 2K Post (high quality)

    // SIMPLES: Enviar o prompt do template EXATAMENTE como está + a foto do usuário
    // O prompt do template já contém as instruções necessárias
    const fullPrompt = template.prompt;

    console.log("=== GERANDO IMAGEM ===");
    console.log("Prompt do template (enviando exatamente como está):", fullPrompt);
    console.log("Formato:", format, "| Dimensões solicitadas:", dimensions.width, "x", dimensions.height);
    console.log("Foto do usuário será enviada junto ao prompt");

    // Fetch the user's image
    const userImageResponse = await fetch(inputImageUrl);
    if (!userImageResponse.ok) {
      console.error("Failed to fetch user image:", userImageResponse.status);
      return new Response(
        JSON.stringify({ success: false, error: "Não foi possível carregar sua foto. Tente novamente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userImageBuffer = await userImageResponse.arrayBuffer();
    const userImageBytes = new Uint8Array(userImageBuffer);
    const userImageMime = userImageResponse.headers.get("content-type") || "image/jpeg";

    console.log("Uploading user image to Google Files API...");
    console.log("Image size:", userImageBytes.length, "bytes, mime:", userImageMime);

    // Upload to Google Files API (no base64 conversion!)
    const uploadedFile = await uploadToGoogleFilesAPI(userImageBytes, userImageMime, geminiApiKey);
    console.log("File uploaded successfully:", uploadedFile.uri);

    // Build request with file_data (file_uri) instead of inline_data (base64)
    const parts: any[] = [
      {
        file_data: {
          file_uri: uploadedFile.uri,
          mime_type: uploadedFile.mimeType,
        },
      },
      { text: fullPrompt },
    ];

    const requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    // IMPORTANT: do NOT retry on 429 here.
    // Retrying immediately will multiply requests and make rate limiting worse.
    // Using gemini-2.0-flash-exp-image-generation - the official experimental model that supports image output
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);
      
      if (geminiResponse.status === 429) {
        const retryAfter = getRetryAfterSeconds(geminiResponse.headers) ?? 60;
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "API do Google Gemini está sobrecarregada. Aguarde 1-2 minutos e tente novamente.",
            retryAfter
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (geminiResponse.status === 403) {
        return new Response(
          JSON.stringify({ success: false, error: "API key inválida ou sem permissões para geração de imagens." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `Erro da API Gemini: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    console.log("Gemini response received");

    // Extract the generated image from Gemini response
    let generatedImageBase64 = null;
    let rawInlineBase64: string | null = null;
    
    if (geminiData.candidates && geminiData.candidates[0]?.content?.parts) {
      for (const part of geminiData.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          rawInlineBase64 = part.inlineData.data;
          generatedImageBase64 = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!generatedImageBase64) {
      console.error("No image in response:", JSON.stringify(geminiData).substring(0, 1000));
      return new Response(
        JSON.stringify({ success: false, error: "Imagem não foi gerada. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract base64 data
    const base64Data = generatedImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Debug: log actual output resolution when possible (PNG only)
    const detected = rawInlineBase64 ? getPngDimensionsFromBase64(rawInlineBase64) : null;
    if (detected) console.log("Generated PNG dimensions:", detected);

    // Upscale when model returns small images (ex: 1024px) — keeps aspect ratio.
    const requestedLongSide = Math.max(dimensions.width, dimensions.height);
    const upscaled = await upscaleImageIfNeeded({ bytes: imageBytes, requestedLongSide });
    if (upscaled.upscaled) {
      console.log("Upscaled image to:", { width: upscaled.width, height: upscaled.height });
    }
    
    const fileName = `generations/${userId}/${Date.now()}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("inteligencia-fotos")
      .upload(fileName, upscaled.bytes, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao salvar imagem gerada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: urlData } = supabase.storage
      .from("inteligencia-fotos")
      .getPublicUrl(uploadData.path);

    const generatedImageUrl = urlData.publicUrl;

    // Save generation to database
    const { error: insertError } = await supabase
      .from("inteligencia_fotos_generations")
      .insert({
        user_id: userId,
        template_id: templateId,
        input_image_url: inputImageUrl,
        generated_image_url: generatedImageUrl,
        format: format || "post",
      });

    if (insertError) {
      console.error("Insert generation error:", insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        generatedImageUrl,
        output: {
          requestedWidth: dimensions.width,
          requestedHeight: dimensions.height,
          detectedWidth: detected?.width ?? null,
          detectedHeight: detected?.height ?? null,
          finalWidth: upscaled.width,
          finalHeight: upscaled.height,
          upscaled: upscaled.upscaled,
        },
        message: "Imagem gerada com sucesso!"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno ao gerar imagem" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});