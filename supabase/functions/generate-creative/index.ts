import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreativeConfig {
  colors: {
    primary: string;
    secondary: string;
    text: string;
  };
  logoType: 'profile' | 'custom' | 'none';
  logoPosition: 'left' | 'center' | 'right';
  fontColor: string;
  customLogoUrl?: string;
  businessType: string;
  customColors?: string[];
}

interface CreativeRequest {
  strategy: {
    title: string;
    description: string;
    type: string;
  };
  profile: {
    username: string;
    fullName: string;
    category: string;
  };
  niche: string;
  config?: CreativeConfig;
  logoUrl?: string;
  isManualMode?: boolean;
  customPrompt?: string;
  personPhotoBase64?: string;
  includeText?: boolean;
  includeLogo?: boolean;
  variationSeed?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      strategy, 
      profile, 
      niche, 
      config, 
      logoUrl, 
      isManualMode, 
      customPrompt, 
      personPhotoBase64,
      includeText = true,
      includeLogo = true,
      variationSeed 
    }: CreativeRequest = await req.json();
    
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // DeepSeek é obrigatório para texto, Lovable AI é necessário apenas para geração de imagem
    if (!DEEPSEEK_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'DEEPSEEK_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API de geração de imagem não configurada. Configure LOVABLE_API_KEY para gerar imagens.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mode = isManualMode ? 'manual' : 'estratégia';
    const hasPersonPhoto = !!personPhotoBase64;
    console.log(`Gerando criativo para: ${profile.username} modo: ${mode} includeText: ${includeText} includeLogo: ${includeLogo} hasPersonPhoto: ${hasPersonPhoto}`);

    // Get colors from config or use defaults
    const colors = config?.colors || { primary: '#1e40af', secondary: '#3b82f6', text: '#ffffff' };
    const businessType = config?.businessType || niche || 'marketing digital';
    const logoPosition = config?.logoPosition || 'center';
    const fontColor = config?.fontColor || '#ffffff';
    const customColors = config?.customColors || [];
    const allColors = [colors.primary, colors.secondary, ...customColors].join(', ');

    // Random variation elements for uniqueness
    const variationId = variationSeed || Date.now();
    const perspectives = ['close-up shot', 'wide angle view', 'aerial perspective', 'side angle', 'dramatic low angle', 'elegant overhead shot'];
    const moods = ['luxurious and premium', 'energetic and dynamic', 'calm and sophisticated', 'bold and impactful', 'warm and inviting', 'modern and sleek'];
    const lightings = ['dramatic studio lighting', 'soft golden hour light', 'neon accent lighting', 'natural daylight', 'cinematic spotlight', 'ambient mood lighting'];
    
    const selectedPerspective = perspectives[variationId % perspectives.length];
    const selectedMood = moods[(variationId + 2) % moods.length];
    const selectedLighting = lightings[(variationId + 4) % lightings.length];

    // Different mental triggers for CTAs
    const triggers = ['escassez', 'autoridade', 'urgência', 'prova social', 'reciprocidade', 'exclusividade'];
    const selectedTrigger = triggers[variationId % triggers.length];

    // Gerar CTA e headline com IA - ONLY if includeText is true
    let headline = '';
    let ctaText = '';

    if (includeText) {
      // Usa DeepSeek para gerar texto
      const textResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'Você é um copywriter especialista em criativos para Instagram. Crie textos curtos e impactantes para alta conversão. Cada criativo deve ser ÚNICO e diferente dos anteriores. IMPORTANTE: Retorne APENAS texto puro, SEM HTML, SEM tags, SEM formatação. Apenas texto simples.'
            },
            {
              role: 'user',
              content: isManualMode && customPrompt 
                ? `Crie um headline e CTA para um criativo de Instagram.

Prompt do usuário: ${customPrompt}
Tipo de Negócio: ${businessType}
Perfil: @${profile.username}
Cores escolhidas: ${allColors}

GATILHO MENTAL OBRIGATÓRIO: Use ${selectedTrigger.toUpperCase()} como principal gatilho mental.

IMPORTANTE: 
- O headline pode ter 2-3 linhas se necessário para ficar mais impactante.
- O texto deve ser centralizado com margem, não muito grudado nas bordas.
- Seja CRIATIVO e ÚNICO - não repita fórmulas comuns.
- RETORNE APENAS TEXTO PURO - SEM HTML, SEM TAGS <p>, SEM style=, SEM formatação.

Retorne JSON:
{
  "headline": "frase impactante com gatilho de ${selectedTrigger} (pode ter 2-3 linhas, max 15 palavras total) - TEXTO PURO APENAS",
  "cta": "chamada para ação urgente (max 5 palavras) - TEXTO PURO APENAS"
}`
                : `Crie um headline e CTA ÚNICOS para um criativo de Instagram.

Nicho: ${niche}
Tipo de Negócio: ${businessType}
Estratégia: ${strategy.type} - ${strategy.title}
Perfil: @${profile.username}
Cores escolhidas: ${allColors}

GATILHO MENTAL OBRIGATÓRIO: Use ${selectedTrigger.toUpperCase()} como principal gatilho mental.
Este é o criativo #${variationId % 100} - deve ser COMPLETAMENTE DIFERENTE dos anteriores.

IMPORTANTE: 
- O headline pode ter 2-3 linhas se necessário para ficar mais impactante.
- O texto deve ser centralizado com margem, não muito grudado nas bordas.
- NÃO repita fórmulas ou frases comuns. Seja CRIATIVO e SURPREENDENTE.
- Use linguagem que conecte emocionalmente com o público.
- RETORNE APENAS TEXTO PURO - SEM HTML, SEM TAGS <p>, SEM style=, SEM formatação.

Retorne JSON:
{
  "headline": "frase impactante com gatilho de ${selectedTrigger} (pode ter 2-3 linhas, max 15 palavras total) - TEXTO PURO APENAS",
  "cta": "chamada para ação única e urgente (max 5 palavras) - TEXTO PURO APENAS"
}`
            }
          ],
          temperature: 0.8,
          max_tokens: 500,
        }),
      });

      if (textResponse.ok) {
        const textData = await textResponse.json();
        const content = textData.choices?.[0]?.message?.content;
        if (content) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              // Strip any HTML tags that might have been included
              headline = (parsed.headline || 'Transforme seu negócio hoje!').replace(/<[^>]*>/g, '').trim();
              ctaText = (parsed.cta || 'Saiba mais agora').replace(/<[^>]*>/g, '').trim();
              console.log('✅ DeepSeek text generation successful');
            }
          } catch (e) {
            console.log('Error parsing DeepSeek text response:', e);
            headline = 'Transforme seu negócio hoje!';
            ctaText = 'Saiba mais agora';
          }
        }
      } else {
        console.error('❌ DeepSeek text generation failed:', await textResponse.text());
        headline = 'Transforme seu negócio hoje!';
        ctaText = 'Saiba mais agora';
      }
    } else {
      console.log('Skipping text generation - includeText is false');
    }

    // Build detailed image prompt with professional style guidance
    console.log('Gerando imagem com I.A MRO...');
    
    // Determine logo position description
    const logoPositionDesc = logoPosition === 'left' ? 'TOP LEFT' : 
                             logoPosition === 'right' ? 'TOP RIGHT' : 'TOP CENTER';
    
    // Build custom prompt if in manual mode
    const contentDescription = isManualMode && customPrompt 
      ? customPrompt 
      : `${businessType} - ${strategy.type}: ${strategy.title}`;

    // Person photo instructions if provided
    const personInstructions = personPhotoBase64 
      ? `
PERSON IN IMAGE - CRITICAL:
- Include the EXACT person from the reference photo in this creative
- PRESERVE their face, physiognomy, and features IDENTICALLY - no changes to appearance
- The person should be professionally posed and styled matching the ${businessType} context
- Keep their natural skin tone, facial structure, and expression characteristics
- Position the person prominently in the composition`
      : '';

    // Layout instructions based on options
    const logoInstructions = includeLogo 
      ? `
MANDATORY LOGO AREA - CRITICAL:
- Reserve a SEAMLESS circular area at ${logoPositionDesc} of the image
- Position: ${logoPosition === 'center' ? 'HORIZONTALLY CENTERED' : logoPosition === 'left' ? 'LEFT SIDE (about 10% from left edge)' : 'RIGHT SIDE (about 10% from right edge)'}, approximately 8-12% from the top edge
- This area must BLEND naturally with the background - NO solid rectangles or bars behind it
- The logo area should be slightly darker/cleaner but NOT a separate shape`
      : `
NO LOGO SPACE:
- Do NOT reserve any space for logos
- Fill the top area with rich visual content`;

    const textInstructions = includeText 
      ? `
LAYOUT FOR TEXT OVERLAY - CRITICAL:
- BOTTOM 35%: Smooth gradient fade for text overlay (seamless dark gradient, not a solid bar)
- Keep bottom area with smooth dark gradient for MULTI-LINE TEXT contrast
- TEXT WILL BE 3-4 LINES, centered horizontally, with generous margins from edges
- The text area needs enough space for headline split across 3-4 lines plus CTA button below`
      : `
NO TEXT OVERLAY SPACE - CRITICAL:
- Do NOT create any gradient fade areas at the bottom
- Do NOT leave dark areas for text
- Fill the BOTTOM with the same rich visual content as the rest
- The image must be COMPLETE and STANDALONE with no reserved spaces`;

    // Full image mode when no text and no logo
    const fullImageMode = !includeText && !includeLogo;
    const layoutDescription = fullImageMode 
      ? `
FULL IMAGE MODE - ABSOLUTELY CRITICAL:
- Fill the ENTIRE canvas from edge to edge with rich visual content
- NO gradients fades at top or bottom
- NO reserved areas for ANY overlays
- NO dark areas at bottom for text - this is a clean image only
- Create a COMPLETE, STANDALONE image with maximum visual impact
- The image must look complete and professional WITHOUT any text or logo additions`
      : `
LAYOUT STRUCTURE:
- TOP: ${includeLogo ? 'Clean gradient area for logo overlay' : 'Rich visual content filling the top'}
- CENTER: ${selectedPerspective} visual representing the business
- BOTTOM: ${includeText ? 'Smooth gradient fade for text overlay' : 'Rich visual content filling the bottom - NO dark gradients'}`;

    const imagePrompt = `Create an ULTRA PROFESSIONAL Instagram marketing creative image.

MASTER QUALITY - ABSOLUTE REQUIREMENTS:
- QUALIDADE MASTER, CRIATIVO FULL HD, NITIDEZ 100%
- Shot with PROFESSIONAL Sony Alpha camera, MAXIMUM image quality
- REALISTIC OBJECTS with perfect textures, shadows, and reflections
- 4K advertising agency quality with rich details and ultra-sharp focus
- Premium ${selectedMood} atmosphere with cinematic color grading
- ${selectedLighting} for dramatic effect with natural light falloff
- ${selectedPerspective} composition with professional depth of field
- HYPER-REALISTIC photography - every detail must look like a real professional photo shoot
- NO artificial or cartoon-like elements - 100% photorealistic rendering

CRITICAL - FULL CANVAS COVERAGE:
- The image MUST FILL 100% of the entire canvas - EDGE TO EDGE with ZERO margins
- NO small images in the center - the visual content must EXTEND to ALL 4 edges
- NO borders, frames, or empty space around the main image
- The visual MUST be LARGE, filling the ENTIRE 1080x1080 pixels without any reduction
- Think of this as a FULL BLEED print - content goes to the absolute edge on all sides

BUSINESS CONTEXT: ${businessType}
CONTENT THEME: ${contentDescription}
UNIQUE VARIATION: #${variationId % 1000} - This must look COMPLETELY DIFFERENT from any previous generation
${personInstructions}

COLOR PALETTE:
- Elegant gradient base using: ${allColors}
- Seamless gradient transitions, NO sharp horizontal lines
- Rich color saturation matching the selected palette
${logoInstructions}

VISUAL CONTENT (BE UNIQUE):
- ${selectedPerspective} of imagery relevant to: ${businessType}
- ${selectedMood} visual treatment
- Each generation must have DIFFERENT composition, subjects, and angles
- DO NOT repeat patterns or concepts from other creatives
- Fill ENTIRE image with rich, detailed visuals - NO SMALL IMAGES
- REALISTIC textures on all objects - wood grain, fabric weave, metal shine, etc.
- The main subject should be LARGE and PROMINENT, not small and centered
${layoutDescription}
${textInstructions}

ABSOLUTE RULES:
- NO text, words, letters, or numbers in the image
- NO horizontal solid color bars or stripes
- NO empty spaces, margins, or borders - FILL EVERYTHING
- NO small centered images - the image must be FULL SIZE edge-to-edge
- ${includeLogo ? 'NO logos or brand marks (just seamless area for overlay)' : 'Complete visual without any logo space - fill entire top with content'}
- ${includeText ? '' : 'NO dark gradient at bottom - fill entire bottom with visual content'}
- Aspect ratio: 1:1 SQUARE (1080x1080) - COMPLETELY FILLED
- Image must extend EDGE TO EDGE with absolutely no visible boundaries or margins
- ${fullImageMode ? 'FULL CONTENT MODE: Every pixel must be rich visual content - NO reserved spaces anywhere' : 'Background must be a seamless gradient, NOT solid blocks'}`;

    // Build message content - include person photo if provided
    const messageContent = personPhotoBase64 
      ? [
          { type: 'text', text: imagePrompt },
          { type: 'image_url', image_url: { url: personPhotoBase64 } }
        ]
      : imagePrompt;

    const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    let imageUrl = null;

    if (imageResponse.ok) {
      const imageData = await imageResponse.json();
      const images = imageData.choices?.[0]?.message?.images;
      
      if (images && images.length > 0) {
        imageUrl = images[0].image_url?.url;
        console.log('Image generated successfully');
      }
    } else {
      console.log('Image generation failed:', await imageResponse.text());
    }

    // Se a geração de imagem falhar, retorna erro (sem usar placeholder simulado)
    if (!imageUrl) {
      console.log('Image generation failed - no fallback available');
      return new Response(
        JSON.stringify({ success: false, error: 'Falha ao gerar imagem. Tente novamente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Calculate expiration (1 month from now)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const creative = {
      id: `creative_${Date.now()}`,
      imageUrl,
      headline,
      ctaText,
      strategyId: strategy.type,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      colors,
      logoUrl: logoUrl || null,
      downloaded: false,
    };

    return new Response(
      JSON.stringify({ success: true, creative }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating creative:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Erro ao gerar criativo', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
