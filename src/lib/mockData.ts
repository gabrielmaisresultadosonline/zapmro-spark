import { InstagramProfile, ProfileAnalysis } from '@/types/instagram';

export const generateMockProfile = (username: string): InstagramProfile => {
  const cleanUsername = username.replace('@', '').replace('https://instagram.com/', '').replace('https://www.instagram.com/', '');
  
  return {
    username: cleanUsername,
    fullName: `${cleanUsername.charAt(0).toUpperCase()}${cleanUsername.slice(1)} Business`,
    bio: `🚀 Transformando negócios locais\n📍 São Paulo, Brasil\n💼 Especialista em ${['Marketing Digital', 'Vendas Online', 'Consultoria', 'Serviços Profissionais'][Math.floor(Math.random() * 4)]}\n👇 Clique no link abaixo`,
    followers: Math.floor(Math.random() * 15000) + 500,
    following: Math.floor(Math.random() * 1500) + 200,
    posts: Math.floor(Math.random() * 300) + 20,
    profilePicUrl: '', // Sem foto simulada - apenas dados reais
    isBusinessAccount: Math.random() > 0.3,
    category: ['Empresa local', 'Marca', 'Criador de conteúdo', 'Loja'][Math.floor(Math.random() * 4)],
    externalUrl: `https://${cleanUsername}.com.br`,
    engagement: Math.random() * 5 + 0.5,
    avgLikes: Math.floor(Math.random() * 500) + 50,
    avgComments: Math.floor(Math.random() * 30) + 5,
    recentPosts: Array.from({ length: 9 }, (_, i) => ({
      id: `post_${i}`,
      imageUrl: '', // Sem imagem simulada - apenas dados reais
      caption: `Post de exemplo ${i + 1} - Conteúdo de qualidade para engajar seu público! 🔥`,
      likes: Math.floor(Math.random() * 500) + 50,
      comments: Math.floor(Math.random() * 50) + 5,
      timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      hasHumanFace: Math.random() > 0.4,
    })),
  };
};

export const generateMockAnalysis = (profile: InstagramProfile): ProfileAnalysis => {
  const hasHumanFaces = profile.recentPosts.filter(p => p.hasHumanFace).length;
  const faceScore = hasHumanFaces / profile.recentPosts.length;
  
  return {
    strengths: [
      profile.isBusinessAccount ? '✅ Conta comercial ativa' : '',
      profile.bio.length > 50 ? '✅ Bio completa e informativa' : '',
      profile.externalUrl ? '✅ Link externo configurado' : '',
      profile.engagement > 2 ? '✅ Taxa de engajamento saudável' : '',
    ].filter(Boolean),
    weaknesses: [
      faceScore < 0.5 ? '⚠️ Poucos posts com rosto humano - conexão emocional baixa' : '',
      profile.followers < 1000 ? '⚠️ Base de seguidores ainda pequena' : '',
      !profile.isBusinessAccount ? '⚠️ Não é conta comercial' : '',
      profile.engagement < 2 ? '⚠️ Taxa de engajamento abaixo da média' : '',
    ].filter(Boolean),
    opportunities: [
      '🎯 Implementar estratégia MRO para crescimento orgânico',
      '🎯 Aumentar frequência de Stories com CTAs',
      '🎯 Criar conteúdo com mais presença humana',
      '🎯 Desenvolver calendário editorial consistente',
    ],
    niche: profile.category || 'Negócio Local',
    audienceType: 'Público local interessado em soluções profissionais',
    contentScore: Math.floor(faceScore * 40 + (profile.posts > 50 ? 30 : 15) + (profile.bio.length > 100 ? 20 : 10)),
    engagementScore: Math.min(100, Math.floor(profile.engagement * 20)),
    profileScore: Math.floor((profile.isBusinessAccount ? 30 : 15) + (profile.externalUrl ? 20 : 0) + (profile.bio.length > 50 ? 25 : 10) + (faceScore * 25)),
    recommendations: [
      `Foco em conteúdo autêntico mostrando ${profile.fullName} em ação`,
      'Implementar rotina diária de Stories com interação',
      'Utilizar MRO para atrair público qualificado organicamente',
      'Criar scripts de vendas personalizados para DMs',
    ],
  };
};
