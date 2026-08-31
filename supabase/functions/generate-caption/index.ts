import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CaptionRequest {
  niche: string;
  product: string;
  objective?: string;
  username?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { niche, product, objective, username }: CaptionRequest = await req.json();
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

    if (!DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY não configurada');
    }

    console.log('Gerando legenda com DeepSeek para:', { niche, product, objective, username });

    const prompt = `Você é um especialista em copywriting para Instagram. Crie uma legenda profissional e persuasiva para uma publicação no Instagram.

DADOS DO PERFIL:
- Nicho: ${niche}
- Produto/Serviço: ${product}
- Objetivo: ${objective || 'engajamento e vendas'}
${username ? `- Perfil: @${username}` : ''}

REQUISITOS DA LEGENDA:
1. Comece com um GANCHO forte que prenda atenção nos primeiros 2 segundos
2. Use gatilhos mentais (urgência, escassez, autoridade, prova social)
3. Conte uma mini-história ou faça uma conexão emocional
4. Inclua benefícios claros do produto/serviço
5. Termine com um CTA (chamada para ação) poderoso
6. Adicione 5-10 hashtags estratégicas relevantes ao nicho
7. Use emojis de forma estratégica para destacar pontos importantes
8. Mantenha parágrafos curtos e espaçados para facilitar leitura no celular

FORMATO:
- Máximo 2200 caracteres (limite do Instagram)
- Use quebras de linha para facilitar leitura
- Separe as hashtags no final

Gere APENAS a legenda pronta para copiar e colar, sem explicações adicionais.`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Você é um copywriter expert em Instagram Marketing. Crie legendas persuasivas e envolventes em português brasileiro.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro DeepSeek:', response.status, errorText);
      throw new Error(`Erro na API DeepSeek: ${response.status}`);
    }

    const data = await response.json();
    const caption = data.choices?.[0]?.message?.content || '';

    if (!caption) {
      throw new Error('Não foi possível gerar a legenda');
    }

    console.log('Legenda gerada com sucesso via DeepSeek');

    return new Response(
      JSON.stringify({ caption }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro ao gerar legenda:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
