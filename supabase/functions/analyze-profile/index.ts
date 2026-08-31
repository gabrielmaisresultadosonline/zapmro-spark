import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisRequest {
  profile: {
    username: string;
    fullName: string;
    bio: string;
    followers: number;
    following: number;
    posts: number;
    isBusinessAccount: boolean;
    category: string;
    externalUrl: string;
  };
  nicheHint?: string; // Admin can provide correct niche for reanalysis
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profile, nicheHint }: AnalysisRequest = await req.json();
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

    console.log('Analisando perfil:', profile.username, nicheHint ? `(Nicho informado: ${nicheHint})` : '');

    // Build context with niche hint if provided
    const nicheContext = nicheHint 
      ? `\n\nIMPORTANTE: O administrador informou que este perfil é do nicho "${nicheHint}". Use esta informação para fazer uma análise mais precisa e contextualizada para este nicho específico.`
      : '';

    // Primeiro, tenta com DeepSeek
    let analysisResult = null;

    if (DEEPSEEK_API_KEY) {
      try {
        const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
                content: `Você é um especialista em marketing digital e Instagram. Analise perfis de Instagram e forneça insights detalhados em português brasileiro.
                
RETORNE APENAS JSON VÁLIDO no seguinte formato:
{
  "strengths": ["lista de pontos fortes com emoji"],
  "weaknesses": ["lista de pontos fracos com emoji"],
  "opportunities": ["lista de oportunidades com emoji"],
  "niche": "nicho identificado",
  "audienceType": "tipo de público-alvo",
  "contentScore": número de 0 a 100,
  "engagementScore": número de 0 a 100,
  "profileScore": número de 0 a 100,
  "recommendations": ["lista de recomendações específicas"]
}${nicheContext}`
              },
              {
                role: 'user',
                content: `Analise este perfil do Instagram:
                
Username: @${profile.username}
Nome: ${profile.fullName}
Bio: ${profile.bio}
Seguidores: ${profile.followers}
Seguindo: ${profile.following}
Posts: ${profile.posts}
Conta comercial: ${profile.isBusinessAccount ? 'Sim' : 'Não'}
Categoria: ${profile.category || 'Não definida'}
Link externo: ${profile.externalUrl || 'Não tem'}
${nicheHint ? `\nNICHO CORRETO (informado pelo admin): ${nicheHint}` : ''}

Taxa de engajamento estimada: ${((profile.followers * 0.03) / profile.posts * 100).toFixed(2)}%

Forneça uma análise completa${nicheHint ? ` focada no nicho de ${nicheHint}` : ''}.`
              }
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (deepseekResponse.ok) {
          const data = await deepseekResponse.json();
          const content = data.choices?.[0]?.message?.content;
          
          if (content) {
            // Extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0]);
              // If admin provided niche, ensure it's used
              if (nicheHint && analysisResult) {
                analysisResult.niche = nicheHint;
              }
              console.log('DeepSeek analysis successful');
            }
          }
        } else {
          console.log('DeepSeek request failed:', await deepseekResponse.text());
        }
      } catch (e) {
        console.error('DeepSeek error:', e);
      }
    }

    // DeepSeek-only mode requested for profile analysis

    // Se nenhuma IA funcionou, gera análise básica
    if (!analysisResult) {
      console.log('Using fallback analysis');
      analysisResult = generateFallbackAnalysis(profile, nicheHint);
    }

    return new Response(
      JSON.stringify({ success: true, analysis: analysisResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error analyzing profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Erro ao analisar perfil', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateFallbackAnalysis(profile: any, nicheHint?: string) {
  const hasGoodBio = profile.bio && profile.bio.length > 50;
  const hasLink = !!profile.externalUrl;
  const followerRatio = profile.following > 0 ? profile.followers / profile.following : 0;
  const niche = nicheHint || profile.category || 'Negócio Local';
  
  return {
    strengths: [
      profile.isBusinessAccount ? '✅ Conta comercial ativa - acesso a métricas' : '',
      hasGoodBio ? '✅ Bio completa e informativa' : '',
      hasLink ? '✅ Link externo configurado' : '',
      followerRatio > 1 ? '✅ Boa proporção seguidores/seguindo' : '',
    ].filter(Boolean),
    weaknesses: [
      !profile.isBusinessAccount ? '⚠️ Não é conta comercial - perde métricas' : '',
      !hasGoodBio ? '⚠️ Bio precisa ser mais completa' : '',
      !hasLink ? '⚠️ Falta link externo (bio link)' : '',
      profile.followers < 1000 ? '⚠️ Base de seguidores pequena' : '',
    ].filter(Boolean),
    opportunities: [
      `🎯 Implementar estratégia MRO para ${niche}`,
      '🎯 Aumentar frequência de Stories com CTAs',
      '🎯 Criar conteúdo com mais presença humana',
      '🎯 Desenvolver calendário editorial consistente',
    ],
    niche: niche,
    audienceType: 'Público local interessado em soluções profissionais',
    contentScore: Math.min(100, Math.floor(profile.posts * 0.3 + (hasGoodBio ? 30 : 10))),
    engagementScore: Math.min(100, Math.floor(Math.random() * 40 + 30)),
    profileScore: Math.floor(
      (profile.isBusinessAccount ? 25 : 10) + 
      (hasLink ? 25 : 0) + 
      (hasGoodBio ? 25 : 10) + 
      (followerRatio > 1 ? 25 : 10)
    ),
    recommendations: [
      `Foco em conteúdo autêntico mostrando ${profile.fullName} em ação`,
      'Implementar rotina diária de Stories com interação',
      'Utilizar MRO para atrair público qualificado organicamente',
      'Criar scripts de vendas personalizados para DMs',
    ],
  };
}
