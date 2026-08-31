import { supabase } from '@/integrations/supabase/client';
import { InstagramProfile, ProfileAnalysis, Strategy, Creative, CreativeConfig } from '@/types/instagram';
import { 
  getCachedProfileData, 
  convertCachedToInstagramProfile, 
  updateCachedProfile 
} from '@/lib/syncStorage';

export const fetchInstagramProfile = async (
  username: string,
  existingPosts?: any[],
  forceRefresh: boolean = false,
  requireLiveData: boolean = false
): Promise<{
  success: boolean;
  profile?: InstagramProfile;
  simulated?: boolean;
  message?: string;
  error?: string;
  fromCache?: boolean;
  canRetry?: boolean;
  isPrivate?: boolean;
  isRestricted?: boolean;
  dataSource?: string;
  liveData?: boolean;
}> => {
  try {
    const normalizedUsername = username.toLowerCase().replace('@', '').trim();
    
    if (!forceRefresh && !requireLiveData) {
      const cacheResult = getCachedProfileData(normalizedUsername);
      
      if (cacheResult.isCached && cacheResult.isRecent && cacheResult.cachedProfile) {
        console.log(`🚀 Usando dados em cache para @${normalizedUsername} (${cacheResult.daysSinceLastUpdate} dias atrás)`);
        
        const cachedProfile = convertCachedToInstagramProfile(cacheResult.cachedProfile);
        
        console.log(`📸 Buscando apenas posts recentes para @${normalizedUsername}...`);
        const { data: postsData, error: postsError } = await supabase.functions.invoke('fetch-instagram', {
          body: { username: normalizedUsername, onlyPosts: true }
        });
        
        if (!postsError && postsData?.success && postsData?.profile?.recentPosts) {
          cachedProfile.recentPosts = postsData.profile.recentPosts;
          cachedProfile.avgLikes = postsData.profile.avgLikes || 0;
          cachedProfile.avgComments = postsData.profile.avgComments || 0;
          cachedProfile.engagement = postsData.profile.engagement || 
            (cachedProfile.followers > 0 ? (cachedProfile.avgLikes / cachedProfile.followers) * 100 : 0);
        }
        
        return {
          success: true,
          profile: cachedProfile,
          simulated: false,
          fromCache: true,
          dataSource: 'local_cache',
          liveData: false,
          message: `Dados em cache (${cacheResult.daysSinceLastUpdate} dias atrás) + posts atualizados`
        };
      }
      
      if (cacheResult.isCached && !cacheResult.isRecent) {
        console.log(`⏰ Cache expirado para @${normalizedUsername} (${cacheResult.daysSinceLastUpdate} dias) - buscando dados novos`);
      }
    }
    
    console.log(`🌐 Buscando dados completos da API para @${normalizedUsername}...`);
    const { data, error } = await supabase.functions.invoke('fetch-instagram', {
      body: { username: normalizedUsername, existingPosts, requireLiveData }
    });

    if (error) {
      console.error('Error fetching profile:', error);
      return { success: false, error: error.message, canRetry: true, liveData: false };
    }

    if (!data.success) {
      if (requireLiveData) {
        return {
          success: false,
          error: data.error || 'Não foi possível buscar dados reais do perfil agora',
          canRetry: data.canRetry || false,
          isPrivate: data.isPrivate || false,
          isRestricted: data.isRestricted || false,
          fromCache: false,
          dataSource: data.dataSource,
          liveData: false,
        };
      }

      const loadCachedAdminProfile = async (): Promise<InstagramProfile | null> => {
        try {
          const { data: adminData, error: adminError } = await supabase.functions.invoke('admin-data-storage', {
            body: { action: 'load' }
          });

          if (adminError || !adminData?.exists || !adminData?.data?.profiles) {
            return null;
          }

          const normalize = (value: string | undefined | null) =>
            (value || '').toLowerCase().replace('@', '').trim();

          const cachedProfile = adminData.data.profiles.find(
            (p: any) => normalize(p.username) === normalizedUsername
          );

          if (!cachedProfile) {
            return null;
          }

          const postsSource = Array.isArray(cachedProfile.recentPosts)
            ? cachedProfile.recentPosts
            : Array.isArray(cachedProfile.posts)
              ? cachedProfile.posts
              : [];

          const numericPosts = typeof cachedProfile.posts === 'number' ? cachedProfile.posts : 0;
          const followers = Number(cachedProfile.followers) || 0;
          const postsCount = Number(cachedProfile.postsCount) || numericPosts || postsSource.length;

          const hasUsefulData =
            followers > 0 ||
            postsCount > 0 ||
            (cachedProfile.bio && String(cachedProfile.bio).trim().length > 0) ||
            (cachedProfile.profilePicture && String(cachedProfile.profilePicture).length > 10) ||
            (cachedProfile.profilePicUrl && String(cachedProfile.profilePicUrl).length > 10) ||
            postsSource.length > 0;

          if (!hasUsefulData) {
            return null;
          }

          const recentPosts = postsSource.map((post: any, idx: number) => ({
            id: post.id || `cached-${idx}`,
            imageUrl: post.imageUrl || post.thumbnail || post.displayUrl || '',
            caption: post.caption || '',
            likes: Number(post.likes) || 0,
            comments: Number(post.comments) || 0,
            timestamp: post.timestamp || new Date().toISOString(),
            hasHumanFace: false
          }));

          const totalLikes = recentPosts.reduce((sum: number, p: any) => sum + (p.likes || 0), 0);
          const totalComments = recentPosts.reduce((sum: number, p: any) => sum + (p.comments || 0), 0);
          const postCountForAverage = recentPosts.length || 1;

          const avgLikes = Number(cachedProfile.avgLikes) || Math.round(totalLikes / postCountForAverage);
          const avgComments = Number(cachedProfile.avgComments) || Math.round(totalComments / postCountForAverage);

          return {
            username: cachedProfile.username || normalizedUsername,
            fullName: cachedProfile.fullName || '',
            bio: cachedProfile.bio || '',
            followers,
            following: Number(cachedProfile.following) || 0,
            posts: postsCount,
            profilePicUrl: cachedProfile.profilePicture || cachedProfile.profilePicUrl || '',
            isBusinessAccount: true,
            category: '',
            externalUrl: Array.isArray(cachedProfile.externalUrl)
              ? cachedProfile.externalUrl[0] || ''
              : cachedProfile.externalUrl || '',
            recentPosts,
            engagement:
              Number(cachedProfile.engagementRate) ||
              Number(cachedProfile.engagement) ||
              (followers > 0 ? (avgLikes / followers) * 100 : 0),
            avgLikes,
            avgComments,
          };
        } catch (cacheError) {
          console.error('Erro ao verificar cache admin:', cacheError);
          return null;
        }
      };

      const cachedAdminProfile = await loadCachedAdminProfile();
      if (cachedAdminProfile) {
        console.log(`✅ Perfil @${normalizedUsername} carregado do cache interno`);
        return {
          success: true,
          profile: cachedAdminProfile,
          simulated: false,
          fromCache: true,
          dataSource: 'admin_cache',
          liveData: false,
          message: data.isRestricted
            ? 'Dados carregados do cache interno (fallback para restrição)'
            : 'Dados carregados do cache interno (fallback da API)'
        };
      }

      return {
        success: false,
        error: data.error || 'Não foi possível buscar o perfil',
        canRetry: data.canRetry || false,
        isPrivate: data.isPrivate || false,
        isRestricted: data.isRestricted || false,
        liveData: false,
      };
    }

    if (data.profile) {
      const responseFromCache = Boolean(data.fromCache);
      const dataSource = data.dataSource || (responseFromCache ? 'admin_cache' : 'bright');

      if (requireLiveData && responseFromCache) {
        return {
          success: false,
          error: 'Não foi possível obter dados reais da Bright agora. Tente sincronizar novamente.',
          canRetry: true,
          isPrivate: data.isPrivate || false,
          isRestricted: data.isRestricted || false,
          fromCache: true,
          dataSource,
          liveData: false,
        };
      }

      const profile: InstagramProfile = {
        ...data.profile,
        engagement: data.profile.engagement || (data.profile.followers > 0 
          ? ((data.profile.avgLikes || 0) / data.profile.followers) * 100 
          : 0),
        avgLikes: data.profile.avgLikes || 0,
        avgComments: data.profile.avgComments || 0,
        recentPosts: data.profile.recentPosts || [],
      };
      
      if (!responseFromCache) {
        updateCachedProfile(normalizedUsername, {
          followers: profile.followers,
          following: profile.following,
          posts: profile.posts,
          profilePicUrl: profile.profilePicUrl,
          fullName: profile.fullName,
          bio: profile.bio
        });
      }

      return { 
        success: true, 
        profile,
        simulated: false,
        fromCache: responseFromCache,
        dataSource,
        liveData: !responseFromCache,
        message: data.message,
        isPrivate: data.isPrivate || false,
        isRestricted: data.isRestricted || false,
      };
    }

    return { success: false, error: 'Não foi possível buscar o perfil', liveData: false };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: 'Erro de conexão', liveData: false };
  }
};

export const recoverProfileFromScreenshot = async (
  username: string,
  screenshotUrl: string,
  currentProfile?: Partial<InstagramProfile>
): Promise<{
  success: boolean;
  profile?: InstagramProfile;
  analysis?: ProfileAnalysis;
  error?: string;
}> => {
  try {
    const normalizedUsername = username.toLowerCase().replace('@', '').trim();

    const { data, error } = await supabase.functions.invoke('analyze-profile-screenshot', {
      body: {
        screenshot_url: screenshotUrl,
        username: normalizedUsername,
      }
    });

    if (error) {
      console.error('Error recovering profile from screenshot:', error);
      return { success: false, error: error.message };
    }

    if (data?.success === false) {
      return {
        success: false,
        error: data?.message || 'O print salvo não pode ser usado para este perfil.'
      };
    }

    const extracted = data?.extracted_data || {};
    const toNumber = (value: unknown): number => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const digits = value.replace(/[^\d]/g, '');
        return digits ? Number(digits) : 0;
      }
      return 0;
    };

    const followers = toNumber(extracted.followers ?? extracted.follower_count ?? currentProfile?.followers);
    const following = toNumber(extracted.following ?? extracted.following_count ?? currentProfile?.following);
    const posts = toNumber(extracted.posts_count ?? extracted.posts ?? currentProfile?.posts);
    const fullName = extracted.full_name || extracted.fullName || currentProfile?.fullName || normalizedUsername;
    const bio = extracted.bio || currentProfile?.bio || '';
    const category = extracted.category || currentProfile?.category || '';
    const externalUrl = extracted.external_link || extracted.externalUrl || currentProfile?.externalUrl || '';
    const isBusinessAccount = typeof extracted.is_business === 'boolean'
      ? extracted.is_business
      : currentProfile?.isBusinessAccount || false;

    const hasUsefulData = followers > 0 || following > 0 || posts > 0 || bio.trim().length > 0;

    if (!hasUsefulData) {
      return {
        success: false,
        error: 'O print salvo não possui dados suficientes para recuperar o perfil.'
      };
    }

    return {
      success: true,
      analysis: data?.analysis,
      profile: {
        username: normalizedUsername,
        fullName,
        bio,
        followers,
        following,
        posts,
        profilePicUrl: '',
        isBusinessAccount,
        category,
        externalUrl,
        recentPosts: [],
        engagement: 0,
        avgLikes: 0,
        avgComments: 0,
        needsScreenshotAnalysis: false,
        dataSource: 'screenshot',
      }
    };
  } catch (error) {
    console.error('Error recovering profile from screenshot:', error);
    return { success: false, error: 'Erro ao recuperar dados do print salvo' };
  }
};

export const analyzeProfile = async (profile: InstagramProfile): Promise<{
  success: boolean;
  analysis?: ProfileAnalysis;
  error?: string;
}> => {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-profile', {
      body: { profile }
    });

    if (error) {
      console.error('Error analyzing profile:', error);
      return { success: false, error: error.message };
    }

    if (data.success && data.analysis) {
      return { success: true, analysis: data.analysis };
    }

    return { success: false, error: 'Não foi possível analisar o perfil' };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: 'Erro de conexão' };
  }
};

export const generateStrategy = async (
  profile: InstagramProfile, 
  analysis: ProfileAnalysis, 
  type: 'mro' | 'content' | 'engagement' | 'sales' | 'bio'
): Promise<{
  success: boolean;
  strategy?: Strategy;
  error?: string;
}> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-strategy', {
      body: { profile, analysis, type }
    });

    if (error) {
      console.error('Error generating strategy:', error);
      return { success: false, error: error.message };
    }

    if (data.success && data.strategy) {
      return { success: true, strategy: data.strategy };
    }

    return { success: false, error: 'Não foi possível gerar a estratégia' };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: 'Erro de conexão' };
  }
};

export const generateCreative = async (
  strategy: Strategy,
  profile: InstagramProfile,
  niche: string,
  config?: CreativeConfig,
  logoUrl?: string,
  isManualMode?: boolean,
  customPrompt?: string,
  personPhotoBase64?: string,
  includeText?: boolean,
  includeLogo?: boolean
): Promise<{
  success: boolean;
  creative?: Creative;
  error?: string;
}> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-creative', {
      body: { 
        strategy, 
        profile, 
        niche,
        config,
        logoUrl: includeLogo === false ? null : logoUrl,
        isManualMode,
        customPrompt,
        personPhotoBase64,
        includeText,
        includeLogo,
        variationSeed: Date.now() + Math.floor(Math.random() * 10000) // Ensure uniqueness
      }
    });

    if (error) {
      console.error('Error generating creative:', error);
      return { success: false, error: error.message };
    }

    if (data.success && data.creative) {
      return { success: true, creative: data.creative };
    }

    return { success: false, error: 'Não foi possível gerar o criativo' };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: 'Erro de conexão' };
  }
};

// Generate auth token for secure API calls
const generateCreativeAuthToken = (username: string): string => {
  const tokenKey = `mro_creative_auth_${username.toLowerCase()}`;
  let token = sessionStorage.getItem(tokenKey);
  if (!token) {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 15);
    token = `${username.toLowerCase()}_${timestamp}_${randomPart}`;
    sessionStorage.setItem(tokenKey, token);
  }
  return token;
};

// Upload creative image to storage and get permanent URL
export const uploadCreativeImage = async (
  username: string,
  creativeId: string,
  imageBase64: string
): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> => {
  try {
    const auth_token = generateCreativeAuthToken(username);
    
    const { data, error } = await supabase.functions.invoke('upload-creative', {
      body: { 
        action: 'upload',
        username, 
        creativeId, 
        imageBase64,
        auth_token
      }
    });

    if (error) {
      console.error('Error uploading creative:', error);
      return { success: false, error: error.message };
    }

    if (data.success && data.url) {
      return { success: true, url: data.url };
    }

    return { success: false, error: data.error || 'Erro ao fazer upload' };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: 'Erro de conexão' };
  }
};

// Delete creative from storage
export const deleteCreativeImage = async (
  username: string,
  creativeId: string
): Promise<boolean> => {
  try {
    const auth_token = generateCreativeAuthToken(username);
    
    await supabase.functions.invoke('upload-creative', {
      body: { 
        action: 'delete',
        username, 
        creativeId,
        auth_token
      }
    });
    return true;
  } catch (error) {
    console.error('Error deleting creative:', error);
    return false;
  }
};
