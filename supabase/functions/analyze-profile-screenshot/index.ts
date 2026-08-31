import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { screenshot_url, username, ocr_text: _ocr_text } = await req.json();

    if (!screenshot_url) {
      return Response.json(
        { success: false, error: 'URL do screenshot é obrigatória' },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`🔍 Analyzing profile screenshot for @${username || 'unknown'} with Gemini Vision`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const normalizedUsername = String(username || 'username').replace('@', '').trim().toLowerCase();

    const systemPrompt = `Você é um especialista em marketing digital e análise de perfis do Instagram.

Você vai receber uma IMAGEM de screenshot de perfil do Instagram. Analise a imagem visualmente e extraia os dados visíveis.

PRIMEIRO: Verifique se a imagem é realmente um print/screenshot de um perfil do Instagram.
Se NÃO for um print do Instagram (por exemplo: foto aleatória, meme, outro app, etc), responda APENAS:
{"not_instagram": true}

Se FOR um print válido do Instagram, extraia APENAS dados realmente visíveis na imagem.
Não invente números. Se algum campo não estiver legível, use 0 ou string vazia.

RETORNE APENAS JSON VÁLIDO no seguinte formato:
{
  "not_instagram": false,
  "extracted_data": {
    "username": "username exato visível no print, sem @",
    "full_name": "",
    "bio": "",
    "followers": 0,
    "following": 0,
    "posts_count": 0,
    "is_business": true,
    "category": "",
    "external_link": "",
    "profile_picture_visible": true,
    "posts_visible": []
  },
  "analysis": {
    "strengths": ["pontos fortes identificados com emoji"],
    "weaknesses": ["pontos fracos identificados com emoji"],
    "opportunities": ["oportunidades de melhoria com emoji"],
    "niche": "nicho identificado",
    "audienceType": "tipo de público-alvo estimado",
    "contentScore": número de 0 a 100,
    "engagementScore": número de 0 a 100,
    "profileScore": número de 0 a 100,
    "recommendations": ["recomendações específicas"]
  },
  "visual_observations": {
    "profile_quality": "avaliação da qualidade visual do perfil",
    "brand_consistency": "consistência visual da marca",
    "content_variety": "variedade do conteúdo visível",
    "grid_aesthetic": "estética do grid de posts"
  }
}

Regras extras:
- followers, following e posts_count devem ser números inteiros.
- Se o print mostrar pontuação brasileira como 4.254 ou 1,2 mil, converta para número inteiro.
- Extraia o username real visível no print. Nunca copie automaticamente o username informado pelo sistema se ele não estiver visível na imagem.
- Se o @ visível no print for diferente de @${normalizedUsername}, ainda retorne o username extraído corretamente no JSON.
- IMPORTANTE: O campo "username" no JSON DEVE ser o username que você VÊ na imagem, não o que foi informado no texto.`;

    const userPrompt = `Analise este print do Instagram e extraia os dados visíveis do perfil.
O perfil cadastrado no sistema é @${normalizedUsername}.
Extraia o username REAL visível na imagem — se for diferente de @${normalizedUsername}, retorne o que está na imagem.
Depois gere uma análise profissional curta baseada no que aparece no print.
Se esta imagem NÃO for um print de perfil do Instagram, retorne {"not_instagram": true}.`;

    if (LOVABLE_API_KEY) {
      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: userPrompt },
                  { type: 'image_url', image_url: { url: screenshot_url } }
                ]
              }
            ],
            temperature: 0.2,
            max_tokens: 2500,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;

          if (content) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const analysisResult = JSON.parse(jsonMatch[0]);

              if (analysisResult.not_instagram === true) {
                console.log('❌ Image is not an Instagram profile screenshot');
                return Response.json({
                  success: false,
                  error: 'not_instagram_profile',
                  message: 'Não conseguimos ler o print do perfil. Você precisa enviar um print real do perfil do Instagram que está utilizando.'
                }, { headers: corsHeaders });
              }

              const extracted = analysisResult.extracted_data || {};
              const extractedUsername = String(extracted.username || '').replace('@', '').trim().toLowerCase();

              if (!extractedUsername) {
                return Response.json({
                  success: false,
                  error: 'username_not_detected',
                  message: `Não conseguimos confirmar o @ do print de @${normalizedUsername}. Envie um print real e nítido do perfil @${normalizedUsername}.`
                }, { headers: corsHeaders });
              }

              if (extractedUsername !== normalizedUsername) {
                console.log(`❌ Username mismatch: expected @${normalizedUsername}, got @${extractedUsername}`);
                return Response.json({
                  success: false,
                  error: 'username_mismatch',
                  message: `O print enviado é do perfil @${extractedUsername}, mas a conta cadastrada é @${normalizedUsername}. Envie um print real do perfil @${normalizedUsername}.`
                }, { headers: corsHeaders });
              }

              extracted.username = extractedUsername;

              return Response.json({
                success: true,
                analysis: analysisResult.analysis,
                extracted_data: extracted,
                visual_observations: analysisResult.visual_observations || null,
              }, { headers: corsHeaders });
            }
          }
        } else {
          const errorText = await response.text();
          console.error('❌ Gemini Vision analysis error:', response.status, errorText);
        }
      } catch (visionError) {
        console.error('❌ Gemini Vision analysis failed:', visionError);
      }
    }

    // Fallback — no API key or vision failed
    return Response.json({
      success: false,
      error: 'analysis_unavailable',
      message: 'Análise de screenshot não disponível no momento. Tente novamente.',
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ Error analyzing screenshot:', error);
    return Response.json(
      { success: false, error: 'Erro ao analisar screenshot' },
      { status: 500, headers: corsHeaders }
    );
  }
});