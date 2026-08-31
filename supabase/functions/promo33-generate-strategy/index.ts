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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { type, email, instagram_username, instagram_data } = await req.json();

    console.log(`[promo33-generate-strategy] Type: ${type}, Instagram: ${instagram_username}`);

    // Get user
    const { data: user, error: userError } = await supabase
      .from('promo33_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Usuário não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check subscription
    if (user.subscription_status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, message: 'Assinatura não está ativa' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle profile analysis request
    if (type === 'analysis') {
      // Calculate engagement from posts
      const posts = instagram_data.posts || [];
      const totalLikes = posts.reduce((sum: number, p: any) => sum + (p.likes || 0), 0);
      const totalComments = posts.reduce((sum: number, p: any) => sum + (p.comments || 0), 0);
      const avgLikes = posts.length > 0 ? Math.round(totalLikes / posts.length) : 0;
      const avgComments = posts.length > 0 ? Math.round(totalComments / posts.length) : 0;
      const engagementRate = instagram_data.followers > 0 
        ? ((avgLikes + avgComments) / instagram_data.followers * 100).toFixed(2) 
        : '0';
      
      // Get external URL from bio
      const externalUrl = Array.isArray(instagram_data.externalUrl) 
        ? (Array.isArray(instagram_data.externalUrl[0]) ? instagram_data.externalUrl[0][0] : instagram_data.externalUrl[0])
        : instagram_data.externalUrl || 'Não possui link na bio';

      const analysisPrompt = `
Analise o seguinte perfil do Instagram e forneça uma análise objetiva.

Perfil: @${instagram_username}
Nome: ${instagram_data.fullName || 'Não informado'}
Bio: ${instagram_data.bio || 'Não informada'}
Link na Bio: ${externalUrl}
Seguidores: ${instagram_data.followers || 0}
Seguindo: ${instagram_data.following || 0}
Total de Posts: ${instagram_data.postsCount || posts.length || 0}

ENGAJAMENTO DOS ÚLTIMOS ${posts.length} POSTS:
- Total de Curtidas: ${totalLikes}
- Total de Comentários: ${totalComments}
- Média de Curtidas por Post: ${avgLikes}
- Média de Comentários por Post: ${avgComments}
- Taxa de Engajamento: ${engagementRate}%

Responda APENAS em formato JSON válido com a seguinte estrutura:
{
  "positives": ["ponto positivo 1", "ponto positivo 2", "ponto positivo 3"],
  "negatives": ["ponto a melhorar 1", "ponto a melhorar 2", "ponto a melhorar 3"]
}

Liste 3 pontos positivos e 3 pontos a melhorar. Seja específico e objetivo, use os dados de engajamento fornecidos.
`;

      const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
      
      if (!deepseekApiKey) {
        // Return default analysis if no API key
        return new Response(
          JSON.stringify({ 
            success: true, 
            analysis: {
              positives: [
                'Perfil ativo com presença nas redes sociais',
                'Base de seguidores estabelecida',
                'Potencial para crescimento orgânico'
              ],
              negatives: [
                'Bio pode ser otimizada para converter mais',
                'Frequência de posts pode ser melhorada',
                'Engajamento pode ser aumentado com estratégias'
              ]
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Você é um especialista em marketing digital e Instagram. Responda apenas em JSON válido.' },
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.5,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao analisar perfil');
      }

      const aiResponse = await response.json();
      const analysisText = aiResponse.choices?.[0]?.message?.content;
      
      let analysis;
      try {
        // Try to parse JSON from response
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('JSON not found');
        }
      } catch {
        analysis = {
          positives: [
            'Perfil ativo com presença nas redes sociais',
            'Base de seguidores estabelecida',
            'Potencial para crescimento orgânico'
          ],
          negatives: [
            'Bio pode ser otimizada para converter mais',
            'Frequência de posts pode ser melhorada',
            'Engajamento pode ser aumentado com estratégias'
          ]
        };
      }

      // Save analysis to instagram_data
      const updatedInstagramData = {
        ...instagram_data,
        analysis
      };

      await supabase
        .from('promo33_users')
        .update({ instagram_data: updatedInstagramData })
        .eq('id', user.id);

      return new Response(
        JSON.stringify({ success: true, analysis }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check 30-day limit for each strategy type
    const existingStrategies = user.strategies_generated || [];
    const existingStrategy = existingStrategies.find((s: any) => s.type === type);
    
    if (existingStrategy) {
      const generatedAt = new Date(existingStrategy.generated_at);
      const now = new Date();
      const daysSinceGeneration = Math.floor((now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceGeneration < 30) {
        const daysRemaining = 30 - daysSinceGeneration;
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Você já gerou esta estratégia. Aguarde ${daysRemaining} dias para gerar novamente.` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build prompt based on strategy type - include engagement data
    const strategyPosts = instagram_data.posts || [];
    const strategyTotalLikes = strategyPosts.reduce((sum: number, p: any) => sum + (p.likes || 0), 0);
    const strategyTotalComments = strategyPosts.reduce((sum: number, p: any) => sum + (p.comments || 0), 0);
    const strategyAvgLikes = strategyPosts.length > 0 ? Math.round(strategyTotalLikes / strategyPosts.length) : 0;
    const strategyAvgComments = strategyPosts.length > 0 ? Math.round(strategyTotalComments / strategyPosts.length) : 0;
    const strategyEngagement = instagram_data.followers > 0 
      ? ((strategyAvgLikes + strategyAvgComments) / instagram_data.followers * 100).toFixed(2) 
      : '0';
    
    const strategyExternalUrl = Array.isArray(instagram_data.externalUrl) 
      ? (Array.isArray(instagram_data.externalUrl[0]) ? instagram_data.externalUrl[0][0] : instagram_data.externalUrl[0])
      : instagram_data.externalUrl || 'Não possui';

    const profileInfo = `
Perfil: @${instagram_username}
Nome: ${instagram_data.fullName || 'Não informado'}
Bio: ${instagram_data.bio || 'Não informada'}
Link na Bio: ${strategyExternalUrl}
Seguidores: ${instagram_data.followers || 0}
Seguindo: ${instagram_data.following || 0}
Total de Posts: ${instagram_data.postsCount || strategyPosts.length || 0}

ENGAJAMENTO (últimos ${strategyPosts.length} posts):
- Média de Curtidas: ${strategyAvgLikes}
- Média de Comentários: ${strategyAvgComments}
- Taxa de Engajamento: ${strategyEngagement}%
`;

    let prompt = '';
    let systemPrompt = `Você é um especialista em marketing digital e Instagram da MRO - Mais Resultados Online. 
Gere estratégias práticas, objetivas e prontas para implementar. Use linguagem direta e amigável.
Responda sempre em português brasileiro.`;

    switch (type) {
      case 'bio':
        prompt = `${profileInfo}

Crie uma estratégia completa de otimização de BIO para este perfil. Inclua:
1. Análise da bio atual (se houver)
2. Sugestão de nova bio otimizada (máximo 150 caracteres)
3. CTA (call-to-action) ideal
4. Emojis estratégicos
5. Link ideal para colocar na bio

Seja específico e dê exemplos práticos.`;
        break;

      case 'growth':
        prompt = `${profileInfo}

Crie uma estratégia completa de CRESCIMENTO ORGÂNICO para este perfil. Inclua:
1. Análise do perfil atual
2. Plano de ação para os próximos 30 dias
3. Horários ideais para postar
4. Tipos de conteúdo que mais engajam
5. Estratégia de hashtags (10-15 hashtags específicas)
6. Técnicas de engajamento
7. Como usar Stories e Reels

Seja específico com números e exemplos.`;
        break;

      case 'sales':
        prompt = `${profileInfo}

Crie SCRIPTS DE VENDAS para usar no Direct deste perfil. Inclua:
1. Script de primeiro contato com lead frio
2. Script de follow-up
3. Script de fechamento
4. Respostas para objeções comuns
5. Como qualificar leads pelo Direct
6. Gatilhos mentais para usar

Dê exemplos de mensagens prontas para copiar e colar.`;
        break;

      case 'content':
        prompt = `${profileInfo}

Crie uma estratégia de CONTEÚDO/CRIATIVOS para este perfil. Inclua:
1. 10 ideias de posts para o feed
2. 10 ideias de Stories
3. 5 ideias de Reels virais
4. Calendário semanal de conteúdo
5. Legendas prontas (3 exemplos)
6. CTAs para usar nas postagens

Seja criativo e específico para o nicho do perfil.`;
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, message: 'Tipo de estratégia inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Call DeepSeek API
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    if (!deepseekApiKey) {
      console.error('[promo33-generate-strategy] DEEPSEEK_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, message: 'API não configurada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[promo33-generate-strategy] DeepSeek error:', errorText);
      throw new Error('Erro ao gerar estratégia');
    }

    const aiResponse = await response.json();
    const strategyContent = aiResponse.choices?.[0]?.message?.content;

    if (!strategyContent) {
      throw new Error('Resposta vazia da IA');
    }

    // Update user with new strategy
    const updatedStrategies = [
      ...existingStrategies.filter((s: any) => s.type !== type),
      {
        type,
        content: strategyContent,
        generated_at: new Date().toISOString()
      }
    ];

    const { data: updatedUser, error: updateError } = await supabase
      .from('promo33_users')
      .update({ strategies_generated: updatedStrategies })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('[promo33-generate-strategy] Update error:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, user: updatedUser }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[promo33-generate-strategy] Error:', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
