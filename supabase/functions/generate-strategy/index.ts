import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface StrategyRequest {
  contactId?: string; // New: for CRM strategy
  profile?: {
    username: string;
    fullName: string;
    bio: string;
    followers: number;
    following?: number;
    posts?: number;
    category: string;
    engagement?: number;
  };
  analysis?: {
    niche: string;
    recommendations: string[];
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    contentScore?: number;
    engagementScore?: number;
    profileScore?: number;
    audienceType?: string;
  };
  type?: 'mro' | 'content' | 'engagement' | 'sales' | 'bio' | 'crm_strategy';
}

const MRO_TOOL_CONTEXT = `
CONTEXTO ESSENCIAL DA FERRAMENTA MRO INTELIGENTE:
A MRO é uma ferramenta de automação para Instagram que funciona assim:

1. INTERAÇÕES AUTOMÁTICAS:
   - Segue perfis + Curte 4 fotos automaticamente
   - Curte 3-5 fotos por perfil visitado
   - Visualiza stories automaticamente
   - Curte stories automaticamente
   - NÃO faz comentários automáticos

2. ESTRATÉGIA DE USO:
   - Interagir com 200 pessoas por sessão, 1 dia sim outro não (dia alternado)
   - Pode rodar de madrugada a noite toda e parar pela manhã
   - OU pode rodar 8 horas por dia durante o dia
   - Usar 1 conta de concorrente/referência por dia como fonte de público
   - Buscar público estratégico: quem curte a página do concorrente, quem comenta, seguidores ativos

3. GERAÇÃO DE SEGUIDORES:
   - A partir das interações, gera seguidores novos organicamente
   - No próximo dia de utilização, dispara mensagens em massa para os novos seguidores
   - Mensagens personalizadas de boas-vindas, promoções, ofertas do nicho

4. CICLO COMPLETO:
   - Dia 1: Interagir com 200 pessoas do concorrente X (seguir + curtir)
   - Dia 2: Descanso (não usar MRO)
   - Dia 3: Enviar mensagens em massa para novos seguidores + Interagir com 200 pessoas do concorrente Y
   - Dia 4: Descanso
   - Repetir ciclo

5. UNFOLLOW PROGRAMADO:
   - Após 3-7 dias, programar unfollow automático
   - Limpar quem não seguiu de volta
   - Manter proporção seguindo/seguidores saudável
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profile, analysis, type, contactId }: StrategyRequest = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

    // CRM CRM Strategy branch
    if (contactId) {
      console.log('Gerando estratégia para CRM contact:', contactId);
      
      const { data: contact } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', contactId)
        .single();
      
      if (!contact) throw new Error('Contato não encontrado');

      const { data: messages } = await supabase
        .from('crm_messages')
        .select('content, direction, created_at, message_type, metadata')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(100);
      
      const { data: settings } = await supabase
        .from('crm_settings')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      const chatHistory = messages?.map(m => {
        let text = m.content || '';
        // Include transcription if it's an audio/voice message and exists in metadata
        if ((m.message_type === 'audio' || m.message_type === 'voice') && m.metadata?.transcription) {
          text = `[ÁUDIO TRANSCRITO]: ${m.metadata.transcription}`;
        }
        return `${m.direction === 'inbound' ? 'CLIENTE' : 'ATENDENTE'} (${new Date(m.created_at).toLocaleString('pt-BR')}): ${text}`;
      }).join('\n') || 'Sem histórico de mensagens.';

      const { customInstruction, action }: any = await req.json().catch(() => ({}));
      
      let crmSystemPrompt = `
        ${customInstruction || settings?.strategy_generation_prompt || 'Analise o histórico acima e gere estratégias personalizadas para converter este cliente.'}
        
        RESUMO DA EMPRESA (O que vendemos):
        ${settings?.business_description || 'Empresa de soluções digitais.'}

        CONTEXTO DO CLIENTE:
        Nome: ${contact.name || 'Desconhecido'}
        WhatsApp ID: ${contact.wa_id}
        Status Atual: ${contact.status}
      `;

      if (action === 'analyze_interaction') {
        crmSystemPrompt = `
          Você é um analista de vendas sênior. Sua tarefa é analisar o histórico de atendimento no CRM e gerar um relatório estratégico.
          
          FOCO DA ANÁLISE:
          1. Retorno do Cliente: O cliente demonstrou interesse genuíno? Ele parou de responder?
          2. Conteúdo Enviado: O que o atendente ofereceu? Foi persuasivo?
          3. Lacunas: O que ficou faltando responder ou oferecer com base nas dúvidas do cliente?
          4. Próximos Passos: Crie uma estratégia de fechamento "matadora" com base no que está sendo oferecido.
          
          Seja direto, crítico e altamente estratégico.
          
          CONTEXTO DO CLIENTE:
          Nome: ${contact.name || 'Desconhecido'}
          WhatsApp ID: ${contact.wa_id}
          Status Atual: ${contact.status}
        `;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings?.openai_api_key || OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: crmSystemPrompt },
            { role: 'user', content: `HISTÓRICO DE CONVERSA:\n${chatHistory}` }
          ],
        }),
      });

      const aiData = await response.json();
      const strategyText = aiData.choices?.[0]?.message?.content;

      if (!strategyText) throw new Error('Falha ao gerar estratégia via IA');

      // Update contact with the new strategy
      const strategyHistory = contact.ai_strategy_history || [];
      const newStrategyEntry = {
        strategy: strategyText,
        type: action === 'analyze_interaction' ? 'Análise Detalhada' : 'Estratégia de Venda',
        created_at: new Date().toISOString()
      };
      
      await supabase
        .from('crm_contacts')
        .update({
          last_ai_strategy: strategyText,
          ai_strategy_history: [newStrategyEntry, ...strategyHistory].slice(0, 20)
        })
        .eq('id', contactId);

      return new Response(
        JSON.stringify({ success: true, strategy: strategyText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Original Instagram branch (profile/analysis based)
    if (!profile) throw new Error('Dados do perfil não fornecidos');

    console.log('Gerando estratégia:', type, 'para:', profile.username);

    const today = new Date();
    const todayStr = today.toLocaleDateString('pt-BR');

    // Build profile context from extracted data
    const profileContext = `
DADOS DO PERFIL (extraídos do print):
- Username: @${profile.username}
- Nome: ${profile.fullName || 'Não informado'}
- Bio: "${profile.bio || 'Sem bio'}"
- Seguidores: ${profile.followers || 0}
- Seguindo: ${profile.following || 0}
- Posts: ${profile.posts || 0}
- Categoria: ${profile.category || 'Não definida'}
- Engajamento: ${profile.engagement ? profile.engagement.toFixed(2) + '%' : 'Não calculado'}

ANÁLISE DO PERFIL:
- Nicho: ${analysis.niche || 'Não identificado'}
- Tipo de público: ${analysis.audienceType || 'Não definido'}
- Score de conteúdo: ${analysis.contentScore || 'N/A'}/100
- Score de engajamento: ${analysis.engagementScore || 'N/A'}/100
- Score do perfil: ${analysis.profileScore || 'N/A'}/100
- Pontos fortes: ${analysis.strengths?.join(', ') || 'Não analisado'}
- Pontos fracos: ${analysis.weaknesses?.join(', ') || 'Não analisado'}
- Oportunidades: ${analysis.opportunities?.join(', ') || 'Não analisado'}
- Recomendações: ${analysis.recommendations?.join(', ') || 'Nenhuma'}
`;

    const strategyPrompts: Record<string, string> = {
      mro: `Crie uma estratégia MRO Inteligente COMPLETA e PERSONALIZADA para @${profile.username}.

DATA DE GERAÇÃO: ${todayStr}
${profileContext}
${MRO_TOOL_CONTEXT}

IMPORTANTE: A estratégia deve ser 100% personalizada para o nicho de "${analysis.niche}".
Exemplo: Se for uma pizzaria, deve indicar buscar público em concorrentes de pizzarias da região, 
enviar mensagens de promoções de pizza, etc.

RETORNE JSON com:
1. "steps": passos detalhados e personalizados usando MRO, com exemplos reais do nicho ${analysis.niche}
2. "mroTutorial": {
   "dailyActions": [
     {"action": "Interagir com 200 pessoas", "quantity": "200 pessoas/sessão, dia sim dia não", "description": "Buscar seguidores do concorrente do nicho de ${analysis.niche}, seguir + curtir 4 fotos"},
     {"action": "Mensagens em massa", "quantity": "Todos novos seguidores", "description": "No dia seguinte, enviar mensagem personalizada de boas-vindas com oferta do nicho"},
     {"action": "Visualizar Stories", "quantity": "Automático", "description": "A ferramenta visualiza e curte stories automaticamente"},
     {"action": "Horário de uso", "quantity": "8h contínuas OU madrugada toda", "description": "Pode rodar de madrugada até manhã ou 8h durante o dia"}
   ],
   "unfollowStrategy": ["Programar unfollow após 3-7 dias", "Limpar quem não seguiu de volta", "Manter taxa saudável"],
   "competitorReference": "Usar 1 conta de concorrente de ${analysis.niche} por dia como fonte de seguidores qualificados",
   "messageTemplates": ["Modelo de mensagem 1 para novos seguidores do nicho ${analysis.niche}", "Modelo 2", "Modelo 3"]
}
3. "scripts": scripts de vendas quando pessoas responderem às mensagens em massa
4. "storiesCalendar": calendário semanal de stories com CTAs
5. "postsCalendar": calendário de posts de 3 em 3 dias (próximos 30 dias) com:
   [{"date": "DD/MM/YYYY", "dayOfWeek": "Segunda", "postType": "Carrossel/Reels/Feed", "content": "descrição personalizada para ${analysis.niche}", "hashtags": ["#tag1"], "bestTime": "18:00", "cta": "CTA do post"}]
6. "metaSchedulingTutorial": tutorial passo-a-passo para agendar no Meta Business Suite`,

      content: `Crie um calendário de conteúdo COMPLETO e PERSONALIZADO para @${profile.username}.

DATA DE GERAÇÃO: ${todayStr}
${profileContext}
${MRO_TOOL_CONTEXT}

Inclua:
1. "steps": estratégia de conteúdo personalizada para ${analysis.niche}
2. "storiesCalendar": calendário semanal de Stories
3. "postsCalendar": calendário de posts de 3 em 3 dias (próximos 30 dias):
   [{"date": "DD/MM/YYYY", "dayOfWeek": "Segunda", "postType": "Carrossel/Reels/Feed", "content": "descrição detalhada para ${analysis.niche}", "hashtags": ["#tag1"], "bestTime": "18:00", "cta": "CTA específico"}]
4. "metaSchedulingTutorial": tutorial passo-a-passo
5. "mroTutorial": ações diárias MRO para complementar o conteúdo (interagir 200 pessoas dia sim dia não, mensagens em massa para novos seguidores)`,

      engagement: `Crie uma estratégia de engajamento COMPLETA usando MRO Inteligente para @${profile.username}.

DATA DE GERAÇÃO: ${todayStr}
${profileContext}
${MRO_TOOL_CONTEXT}

Inclua:
1. "steps": como usar MRO para aumentar engajamento no nicho de ${analysis.niche} (interagir 200 pessoas dia sim dia não, mensagens em massa)
2. "mroTutorial": ações diárias específicas incluindo templates de mensagens para o nicho
3. "storiesCalendar": calendário com foco em engajamento
4. "postsCalendar": posts de 3 em 3 dias
5. "metaSchedulingTutorial": como agendar via Meta`,

      sales: `Crie scripts de vendas COMPLETOS e PERSONALIZADOS para @${profile.username}.

DATA DE GERAÇÃO: ${todayStr}
${profileContext}
${MRO_TOOL_CONTEXT}

IMPORTANTE: Os scripts devem usar o ciclo MRO completo:
- Interagir com 200 pessoas do concorrente (dia sim dia não)
- Mensagens em massa para novos seguidores com oferta do nicho ${analysis.niche}
- Scripts de follow-up quando responderem

Inclua:
1. "steps": funil de vendas usando MRO
2. "scripts": scripts detalhados com gatilhos específicos para ${analysis.niche}
3. "storiesCalendar": stories de vendas
4. "postsCalendar": posts de 3 em 3 dias focados em conversão
5. "mroTutorial": como usar MRO para gerar leads com mensagens em massa
6. "metaSchedulingTutorial": agendamento no Meta`,

      bio: `Crie uma bio otimizada para o Instagram de @${profile.username}.

DATA DE GERAÇÃO: ${todayStr}
${profileContext}

ANALISE A BIO ATUAL e crie uma versão melhorada com:
- Proposta de valor clara no início
- O que a pessoa/empresa faz no nicho de ${analysis.niche}
- Benefício para quem segue
- CTA forte (Call to Action)
- Uso estratégico de emojis
- Máximo 150 caracteres

RETORNE JSON com:
1. "bioAnalysis": {
   "currentBio": "${profile.bio || 'Sem bio'}",
   "problems": ["problema 1", "problema 2"],
   "strengths": ["ponto forte 1"]
}
2. "suggestedBios": [
   {"bio": "sugestão 1 completa", "focus": "Foco: proposta de valor"},
   {"bio": "sugestão 2 completa", "focus": "Foco: benefício"},
   {"bio": "sugestão 3 completa", "focus": "Foco: autoridade"}
]
3. "tips": ["dica 1", "dica 2", "dica 3"]
4. "steps": ["passo 1", "passo 2"]`,
    };

    const systemPrompt = `Você é um especialista em marketing digital e vendas no Instagram, com profundo conhecimento da ferramenta MRO Inteligente.

IMPORTANTE: Você DEVE criar estratégias 100% PERSONALIZADAS baseadas nos dados reais do perfil fornecidos (extraídos do print do Instagram).
Use os dados de seguidores, nicho, bio, pontos fortes/fracos para criar uma estratégia única.

${MRO_TOOL_CONTEXT}

RETORNE APENAS JSON VÁLIDO (sem markdown, sem \`\`\`) no formato:
{
  "title": "título da estratégia personalizado",
  "description": "descrição breve personalizada",
  "steps": ["passo 1 com emoji", "passo 2 com emoji", ...],
  "scripts": [
    {
      "situation": "situação",
      "opening": "frase de abertura",
      "body": "desenvolvimento",
      "closing": "fechamento",
      "scarcityTriggers": ["gatilho 1", "gatilho 2"]
    }
  ],
  "storiesCalendar": [
    {
      "day": "Segunda",
      "stories": [
        {"time": "08:00", "type": "engagement", "content": "conteúdo", "hasButton": false},
        {"time": "18:00", "type": "cta", "content": "oferta", "hasButton": true, "buttonText": "Saiba mais"}
      ]
    }
  ],
  "postsCalendar": [
    {"date": "DD/MM/YYYY", "dayOfWeek": "Terça", "postType": "Carrossel", "content": "descrição", "hashtags": ["#tag1"], "bestTime": "18:00", "cta": "Link na bio"}
  ],
  "mroTutorial": {
    "dailyActions": [
      {"action": "nome da ação", "quantity": "quantidade", "description": "como fazer"}
    ],
    "unfollowStrategy": ["passo 1", "passo 2"],
    "competitorReference": "usar 1 conta por dia",
    "messageTemplates": ["modelo de mensagem 1", "modelo 2"]
  },
  "metaSchedulingTutorial": [
    "1. Passo um...",
    "2. Passo dois..."
  ]
}`;

    let strategyResult = null;

    // DeepSeek only
    if (DEEPSEEK_API_KEY) {
      try {
        console.log('Fallback: Gerando com DeepSeek...');
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: strategyPrompts[type] }
            ],
            temperature: 0.8,
            max_tokens: 6000,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              strategyResult = JSON.parse(jsonMatch[0]);
              console.log('✅ DeepSeek strategy generated successfully');
            }
          }
        } else {
          const errorText = await response.text();
          console.error('❌ DeepSeek error:', response.status, errorText);
        }
      } catch (e) {
        console.error('❌ DeepSeek error:', e);
      }
    }

    // Fallback básico
    if (!strategyResult) {
      strategyResult = generateFallbackStrategy(type, profile, analysis);
    }

    // Adiciona metadados
    strategyResult.id = `strategy_${Date.now()}`;
    strategyResult.type = type;
    strategyResult.createdAt = new Date().toISOString();

    return new Response(
      JSON.stringify({ success: true, strategy: strategyResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating strategy:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Erro ao gerar estratégia', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateFallbackStrategy(type: string, profile: any, analysis: any) {
  const today = new Date();
  const niche = analysis?.niche || 'seu nicho';
  
  const postsCalendar = [];
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const postTypes = ['Carrossel educativo', 'Reels com áudio viral', 'Post de valor', 'Carrossel de dicas', 'Reels bastidores', 'Post de depoimento'];
  
  for (let i = 0; i < 10; i++) {
    const postDate = new Date(today);
    postDate.setDate(postDate.getDate() + (i * 3));
    postsCalendar.push({
      date: postDate.toLocaleDateString('pt-BR'),
      dayOfWeek: dayNames[postDate.getDay()],
      postType: postTypes[i % postTypes.length],
      content: `Conteúdo sobre ${niche} - post ${i + 1}`,
      hashtags: [`#${niche.replace(/\s/g, '')}`, '#dicasinstagram', '#marketingdigital'],
      bestTime: '18:00',
      cta: 'Link na bio 👇'
    });
  }

  const mroTutorial = {
    dailyActions: [
      { action: 'Interagir com 200 pessoas', quantity: '200/sessão, dia sim dia não', description: `Buscar seguidores ativos de concorrentes de ${niche}, seguir + curtir 4 fotos` },
      { action: 'Mensagens em massa', quantity: 'Todos novos seguidores', description: `Enviar mensagem personalizada de boas-vindas com oferta de ${niche}` },
      { action: 'Visualizar + Curtir Stories', quantity: 'Automático', description: 'A MRO faz automaticamente' },
      { action: 'Horário de uso', quantity: '8h contínuas', description: 'Pode rodar de madrugada toda ou 8h durante o dia' },
    ],
    unfollowStrategy: [
      'Programar unfollow após 3-7 dias',
      'Limpar quem não seguiu de volta',
      'Manter proporção seguindo/seguidores saudável',
      'Não fazer unfollow em massa no mesmo dia'
    ],
    competitorReference: `Escolha 1 conta concorrente de ${niche} por dia como fonte de seguidores qualificados`,
    messageTemplates: [
      `Oi! 👋 Seja bem-vindo(a)! Vi que você se interessa por ${niche}. Temos uma oferta especial essa semana!`,
      `Olá! 😊 Obrigado por seguir! Que tal conhecer nossos serviços de ${niche}?`,
      `Ei! 🔥 Novo por aqui? Aproveite nossa promoção exclusiva para novos seguidores!`
    ]
  };

  const metaSchedulingTutorial = [
    '1. Acesse business.facebook.com e faça login',
    '2. Conecte sua conta do Instagram nas configurações',
    '3. Vá em "Conteúdo" > "Criar publicação"',
    '4. Selecione "Instagram" como destino',
    '5. Adicione a imagem/vídeo e legenda do calendário',
    '6. Clique em "Agendar" e selecione a data/hora',
    '7. Repita para cada post do calendário (3 em 3 dias)',
    '8. Monitore os agendamentos em "Conteúdo" > "Publicações"'
  ];

  const strategies: Record<string, any> = {
    mro: {
      title: `Estratégia MRO Inteligente para @${profile.username}`,
      description: `Estratégia de crescimento orgânico usando MRO para ${niche}. Interaja com 200 pessoas dia sim dia não e dispare mensagens em massa para novos seguidores. Gerada em ${todayStr()}.`,
      steps: [
        `🎯 Configure a MRO com público-alvo de ${niche}`,
        '📍 Defina a localização para sua região de atuação',
        `🔍 Escolha 1 concorrente de ${niche} como referência do dia`,
        '⏰ Rode 8h durante o dia OU de madrugada até manhã',
        '👥 Interaja com 200 pessoas por sessão (dia sim, dia não)',
        '❤️ A MRO segue + curte 4 fotos automaticamente',
        '👀 Visualização e curtida de Stories automática',
        `📩 No dia seguinte, envie mensagens em massa para novos seguidores com oferta de ${niche}`,
        '🔄 Programe unfollow após 3-7 dias',
        '📊 Monitore resultados semanalmente',
      ],
      scripts: [{
        situation: `Novo seguidor responde a mensagem em massa sobre ${niche}`,
        opening: 'Oi! 👋 Que bom que se interessou!',
        body: `Trabalhamos com ${niche} e temos condições especiais essa semana.`,
        closing: 'Posso te explicar melhor? Sem compromisso! 😊',
        scarcityTriggers: ['⚡ Vagas limitadas essa semana', '🔥 Preço especial só até sexta'],
      }],
      mroTutorial,
      postsCalendar,
      metaSchedulingTutorial,
    },
    content: {
      title: `Calendário de Conteúdo para @${profile.username}`,
      description: `Estratégia de conteúdo otimizada para ${niche}. Gerada em ${todayStr()}.`,
      steps: [
        '📸 Posts de 3 em 3 dias conforme calendário',
        '🎥 Alternar entre Reels, Carrosséis e Posts',
        '💡 Usar CTAs fortes em cada post',
        '📱 Stories diários com enquetes e CTAs',
        '⏰ Agendar no Meta Business Suite',
        '🔍 Complementar com MRO: 200 interações dia sim dia não',
        '📩 Mensagens em massa para novos seguidores',
      ],
      scripts: [],
      mroTutorial,
      postsCalendar,
      metaSchedulingTutorial,
    },
    engagement: {
      title: `Estratégia de Engajamento para @${profile.username}`,
      description: `Aumente engajamento com MRO no nicho de ${niche}. Gerada em ${todayStr()}.`,
      steps: [
        '📱 Poste Stories 5-8x por dia com enquetes',
        '💬 Responda TODOS os comentários em 1h',
        '🎯 Use CTAs fortes nos posts',
        `👥 Interaja com 200 pessoas do nicho ${niche} dia sim dia não`,
        '📩 Mensagens em massa para novos seguidores',
        '👀 Visualizar stories automaticamente com MRO',
        '🔔 Ative notificações para responder rápido',
      ],
      scripts: [],
      mroTutorial,
      postsCalendar,
      metaSchedulingTutorial,
    },
    sales: {
      title: `Scripts de Vendas para @${profile.username}`,
      description: `Scripts de alta conversão para ${niche} usando MRO. Gerada em ${todayStr()}.`,
      steps: [
        `🎯 Use MRO para interagir com 200 pessoas de ${niche} dia sim dia não`,
        '📩 Envie mensagens em massa para novos seguidores com oferta',
        '💡 Qualifique o lead quando responder',
        '📊 Use provas sociais nos posts',
        '⏰ Crie urgência genuína',
        '🔄 Follow-up em 24/48/72h',
      ],
      scripts: [
        {
          situation: 'Mensagem em massa para novo seguidor',
          opening: `Oi! 👋 Bem-vindo(a)! Vi que você se interessa por ${niche}!`,
          body: 'Que tal conhecer nossas condições especiais? Já ajudamos muitas pessoas.',
          closing: 'Essa semana temos uma oferta exclusiva para novos seguidores! 🔥',
          scarcityTriggers: ['⚡ Só até sexta', '📍 Vagas limitadas'],
        },
        {
          situation: 'Lead quente - Respondeu à mensagem',
          opening: 'Que bom que se interessou! 🔥',
          body: `Deixa eu explicar como funciona nosso serviço de ${niche}.`,
          closing: 'Para quem fechar essa semana, tenho condição especial.',
          scarcityTriggers: ['🔥 Bônus só até amanhã', '📍 Últimas vagas'],
        },
      ],
      mroTutorial,
      postsCalendar,
      metaSchedulingTutorial,
    },
    bio: {
      title: `Otimização de Bio para @${profile.username}`,
      description: `Bio otimizada para ${niche}. Gerada em ${todayStr()}.`,
      steps: [
        '📝 Analise sua bio atual',
        '✨ Escolha uma das sugestões abaixo',
        '📱 Copie e cole no Instagram',
        '🔗 Adicione seu link na bio',
      ],
      bioAnalysis: {
        currentBio: profile.bio || 'Bio não encontrada',
        problems: ['Bio pode ser mais direta', 'Falta CTA claro', 'Proposta de valor não está clara'],
        strengths: ['Presença no Instagram estabelecida'],
      },
      suggestedBios: [
        { bio: `🎯 ${niche} | Transformo seguidores em clientes 💰 Resultados garantidos 👇`, focus: 'Foco: conversão' },
        { bio: `✨ Especialista em ${niche} | Clientes satisfeitos | Link abaixo 👇`, focus: 'Foco: autoridade' },
        { bio: `${niche} 🚀 Te ajudo a crescer | Comece agora 👇`, focus: 'Foco: benefício' },
      ],
      tips: [
        '💡 Comece com sua proposta de valor',
        '🎯 Use 3-4 emojis estratégicos',
        '📍 Adicione localização se for negócio local',
        '🔗 Link na bio deve levar para ação',
      ],
      scripts: [],
      mroTutorial: {},
      postsCalendar: [],
      metaSchedulingTutorial: [],
    },
  };

  function todayStr() {
    return today.toLocaleDateString('pt-BR');
  }

  const strategy = strategies[type] || strategies.mro;
  strategy.storiesCalendar = generateStoriesCalendar(niche);
  return strategy;
}

function generateStoriesCalendar(niche: string) {
  const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  return days.map(day => ({
    day,
    stories: [
      { time: '08:00', type: 'engagement', content: `Bom dia! Enquete sobre ${niche}`, hasButton: false },
      { time: '12:00', type: 'behind-scenes', content: 'Bastidores do dia', hasButton: false },
      { time: '15:00', type: 'cta', content: `Novidade em ${niche}! Link na bio 👇`, hasButton: true, buttonText: 'Saiba mais' },
      { time: '18:00', type: 'testimonial', content: 'Resultado do cliente 🔥', hasButton: false },
      { time: '21:00', type: 'offer', content: 'Última chance! ⏰', hasButton: true, buttonText: 'Aproveitar' },
    ],
  }));
}
