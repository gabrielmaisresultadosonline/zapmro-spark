import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Bright Data API configuration
const BRIGHTDATA_API_URL = 'https://api.brightdata.com/datasets/v3/scrape';
const INSTAGRAM_PROFILES_DATASET_ID = 'gd_l1vikfch901nx3by4';

interface InstagramProfile {
  username: string;
  fullName: string;
  bio: string;
  followers: number;
  following: number;
  posts: number;
  profilePicUrl: string;
  isBusinessAccount: boolean;
  category: string;
  externalUrl: string;
}

interface InstagramPost {
  id: string;
  imageUrl: string;
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  hasHumanFace: boolean;
}

// Cache image to Supabase storage and return public URL
const cacheImageToStorage = async (
  supabase: any,
  supabaseUrl: string,
  imageUrl: string,
  bucket: string,
  fileName: string
): Promise<string | null> => {
  if (!imageUrl) return null;

  try {
    // First try with weserv proxy (better for Instagram CDN)
    let fetchUrl = imageUrl;
    if (imageUrl.includes('instagram') || imageUrl.includes('cdninstagram') || imageUrl.includes('fbcdn')) {
      fetchUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=400&h=400&fit=cover&output=jpg&q=90`;
    }

    console.log(`[cache] Fetching image: ${fetchUrl.substring(0, 80)}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*',
          'Referer': 'https://www.instagram.com/',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.log(`[cache] HTTP ${response.status} for ${fetchUrl.substring(0, 50)}`);
      
      // Try direct URL as fallback
      if (fetchUrl !== imageUrl && imageUrl.startsWith('http')) {
        console.log(`[cache] Trying direct URL...`);
        const directResp = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'image/*',
          },
        });
        if (directResp.ok) {
          response = directResp;
        } else {
          return null;
        }
      } else {
        return null;
      }
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.includes('image')) {
      console.log(`[cache] Not an image: ${contentType}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length < 1024) {
      console.log(`[cache] Image too small: ${bytes.length} bytes`);
      return null;
    }

    // Delete existing file first (upsert doesn't always work)
    await supabase.storage.from(bucket).remove([fileName]);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, bytes, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.log(`[cache] Upload error: ${uploadError.message}`);
      return null;
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
    console.log(`[cache] ✓ Cached successfully: ${fileName}`);
    return publicUrl;
  } catch (e) {
    console.log(`[cache] Error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
};

// Fallback proxy for images (when cache fails)
const proxyImage = (url: string | undefined | null): string => {
  if (!url) return '';
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=400&q=80`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { username, existingPosts, onlyPosts, requireLiveData } = await req.json();
    
    if (!username) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanUsername = username
      .replace('@', '')
      .replace('https://instagram.com/', '')
      .replace('https://www.instagram.com/', '')
      .replace('/', '')
      .trim()
      .toLowerCase();

    console.log(`Fetching Instagram profile via Bright Data: ${cleanUsername} (onlyPosts: ${onlyPosts || false}, requireLiveData: ${requireLiveData || false})`);

    const BRIGHTDATA_TOKEN_RAW = Deno.env.get('BRIGHTDATA_API_TOKEN') || '';
    const BRIGHTDATA_TOKEN = BRIGHTDATA_TOKEN_RAW
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1');
    const INSTAGRAM_SESSION_ID = Deno.env.get('INSTAGRAM_SESSION_ID');
    
    if (!BRIGHTDATA_TOKEN) {
      console.error('BRIGHTDATA_API_TOKEN not configured');
      return Response.json({ 
        success: false, 
        error: 'Token da Bright Data não configurado. Configure o token nas configurações.'
      }, { status: 500, headers: corsHeaders });
    }

    // Helper function to scrape Instagram directly via web page
    const scrapeInstagramDirect = async (): Promise<{ data: any | null; isPrivate?: boolean; isRestricted?: boolean }> => {
      console.log('🔍 Tentando scraping direto do Instagram...');
      
      try {
        // Try to fetch the Instagram page directly with mobile user agent
        const response = await fetch(`https://www.instagram.com/${cleanUsername}/?__a=1&__d=dis`, {
          headers: {
            'User-Agent': 'Instagram 219.0.0.12.117 Android',
            'Accept': 'application/json',
            'X-IG-App-ID': '936619743392459',
          }
        });
        
        if (response.ok) {
          const text = await response.text();
          console.log(`📥 Direct scrape response (${text.length} chars)`);
          
          try {
            const data = JSON.parse(text);
            if (data.graphql?.user || data.user) {
              const user = data.graphql?.user || data.user;
              
              // Check if profile is private
              const isPrivate = user.is_private === true;
              console.log(`📊 Profile private status: ${isPrivate}`);
              
              // Check for age restriction (usually indicated by empty data for public profiles)
              const isRestricted = !isPrivate && user.is_age_gated === true;
              
              console.log('✅ Direct scrape successful!');
              return {
                data: {
                  profile_name: user.full_name || user.username,
                  account: user.username,
                  biography: user.biography,
                  followers: user.edge_followed_by?.count || user.follower_count || 0,
                  following: user.edge_follow?.count || user.following_count || 0,
                  posts_count: user.edge_owner_to_timeline_media?.count || user.media_count || 0,
                  profile_image_link: user.profile_pic_url_hd || user.profile_pic_url,
                  is_business_account: user.is_business_account || user.is_professional_account,
                  is_private: isPrivate,
                  category: user.category_name || user.category || '',
                  external_url: user.external_url || '',
                },
                isPrivate,
                isRestricted
              };
            }
          } catch (e) {
            console.log('❌ Failed to parse direct scrape response');
          }
        } else {
          console.log(`❌ Direct scrape failed with status: ${response.status}`);
        }
      } catch (e) {
        console.error('❌ Direct scrape error:', e);
      }
      
      return { data: null };
    };

    // Helper function to make Bright Data API call
    const callBrightDataAPI = async (attempt: number, useAuth: boolean = false): Promise<Response> => {
      console.log(`🔄 Bright Data API tentativa ${attempt}/2 para: ${cleanUsername} (auth: ${useAuth})`);
      const profileUrl = `https://www.instagram.com/${cleanUsername}/`;
      
      // Build request body with optional session cookie for authenticated requests
      const requestBody: any = {
        input: [{ url: profileUrl }]
      };
      
      // Add session cookie for authenticated requests to access age-restricted profiles
      if (useAuth && INSTAGRAM_SESSION_ID) {
        requestBody.browser_instructions = [
          {
            action: "set_cookies",
            cookies: [
              {
                name: "sessionid",
                value: INSTAGRAM_SESSION_ID,
                domain: ".instagram.com",
                path: "/",
                secure: true,
                httpOnly: true
              }
            ]
          }
        ];
        console.log('🍪 Added Instagram session cookie for authenticated request');
      }

      const endpoint = `${BRIGHTDATA_API_URL}?dataset_id=${INSTAGRAM_PROFILES_DATASET_ID}&format=json`;
      const baseHeaders = { 'Content-Type': 'application/json' };
      const body = JSON.stringify(requestBody);

      const authVariants: Record<string, string>[] = [
        { Authorization: `Bearer ${BRIGHTDATA_TOKEN}` },
        { Authorization: BRIGHTDATA_TOKEN },
        { 'X-API-Key': BRIGHTDATA_TOKEN },
      ];

      let lastResponse: Response | null = null;

      for (let i = 0; i < authVariants.length; i++) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            ...baseHeaders,
            ...authVariants[i],
          },
          body,
        });

        lastResponse = response;

        if (response.status !== 401) {
          return response;
        }

        const errorBody = await response.clone().text();
        console.log(`⚠️ Bright auth variant ${i + 1} failed: ${errorBody.substring(0, 120)}`);
      }

      return lastResponse!;
    };

    // Helper function to process Bright Data response
    const processBrightDataResponse = async (response: Response): Promise<any | null> => {
      if (!response.ok) {
        console.log(`❌ Bright Data API status: ${response.status}`);
        const errorText = await response.text();
        console.log(`❌ Bright Data error body: ${errorText.substring(0, 500)}`);
        return null;
      }

      const data = await response.json();
      const rawResponse = JSON.stringify(data);
      console.log(`📥 Bright Data raw response (${rawResponse.length} chars): ${rawResponse.substring(0, 2000)}`);
      
      // Handle empty array response - Bright Data sometimes returns [] for valid profiles
      if (Array.isArray(data) && data.length === 0) {
        console.log(`⚠️ Bright Data returned empty array [] for ${cleanUsername} - may be temporary issue`);
        return null;
      }
      
      const profileData = Array.isArray(data) ? data[0] : data;
      
      // Check if we have valid profile data
      if (profileData && (profileData.followers !== undefined || profileData.id || profileData.profile_name)) {
        console.log(`✅ Valid profile data found: followers=${profileData.followers}, id=${profileData.id}`);
        return profileData;
      }
      
      console.log('❌ No valid profile data in response structure');
      return null;
    };

    const hasAuthSession = !!INSTAGRAM_SESSION_ID;

    try {
      let profileData = null;
      let detectedIsPrivate = false;
      let detectedIsRestricted = false;
      let dataSource: 'direct' | 'bright' | 'admin_cache' = 'bright';

      const directResult = await scrapeInstagramDirect();
      if (directResult.data) {
        profileData = directResult.data;
        detectedIsPrivate = directResult.isPrivate || false;
        detectedIsRestricted = directResult.isRestricted || false;
        dataSource = 'direct';
      }

      if (!profileData) {
        try {
          const response1 = await callBrightDataAPI(1, false);
          
          if (response1.status === 202) {
            console.log('⏳ Bright Data returned 202 (async) on attempt 1');
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            profileData = await processBrightDataResponse(response1);
            if (profileData) {
              detectedIsPrivate = profileData.is_private === true;
              dataSource = 'bright';
            }
          }
        } catch (e) {
          console.error('❌ Bright Data attempt 1 failed:', e);
        }
      }

      if (!profileData) {
        console.log('⚠️ Primeira tentativa falhou, tentando novamente...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        try {
          const response2 = await callBrightDataAPI(2, false);
          
          if (response2.status === 202) {
            console.log('⏳ Bright Data returned 202 (async) on attempt 2');
          } else {
            profileData = await processBrightDataResponse(response2);
            if (profileData) {
              detectedIsPrivate = profileData.is_private === true;
              dataSource = 'bright';
            }
          }
        } catch (e) {
          console.error('❌ Bright Data attempt 2 failed:', e);
        }
      }

      if (!profileData && hasAuthSession) {
        console.log('🔐 Tentando com sessão autenticada para perfis restritos...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        try {
          const response3 = await callBrightDataAPI(3, true);
          
          if (response3.status === 202) {
            console.log('⏳ Bright Data returned 202 (async) on authenticated attempt');
            return Response.json({ 
              success: false, 
              error: 'Perfil restrito em processamento. Clique em "Tentar novamente" em 30 segundos.',
              retryAfter: 30,
              canRetry: true
            }, { headers: corsHeaders });
          } else {
            profileData = await processBrightDataResponse(response3);
            if (profileData) {
              console.log('✅ Perfil restrito acessado via sessão autenticada!');
              detectedIsPrivate = profileData.is_private === true;
              dataSource = 'bright';
            }
          }
        } catch (e) {
          console.error('❌ Bright Data authenticated attempt failed:', e);
        }
      }

      if (!profileData) {
        if (requireLiveData) {
          const isRestrictionConfirmed = detectedIsRestricted === true;
          console.log(`❌ @${cleanUsername} sem dado real disponível e fallback bloqueado (requireLiveData)`);
          return Response.json({
            success: false,
            error: isRestrictionConfirmed
              ? 'Este perfil possui restrição de idade e não pode ser acessado automaticamente.'
              : 'Não foi possível acessar dados reais deste perfil agora. Tente novamente em alguns instantes.',
            canRetry: true,
            retryAfter: isRestrictionConfirmed ? 60 : 30,
            isRestricted: isRestrictionConfirmed,
            isPrivate: false,
            dataSource: 'bright'
          }, { headers: corsHeaders });
        }

        console.log(`⚠️ All scraping attempts failed for @${cleanUsername}, trying admin cache fallback...`);
        
        try {
          const { data: fileData } = await supabase.storage
            .from('user-data')
            .download('admin/sync-data.json');
          
          if (fileData) {
            const syncText = await fileData.text();
            const syncData = JSON.parse(syncText);
            const cachedProfiles = Array.isArray(syncData?.profiles) ? syncData.profiles : [];
            
            const cached = cachedProfiles.find((p: any) => {
              const pUsername = String(p?.username ?? p?.profile?.username ?? '').trim().toLowerCase();
              return pUsername === cleanUsername;
            });
            
            if (cached) {
              const cFollowers = cached.followers ?? cached.profile?.followers ?? 0;
              const cPosts = cached.posts ?? cached.postsCount ?? cached.profile?.posts ?? 0;
              const cBio = cached.bio ?? cached.profile?.bio ?? '';
              const cFullName = cached.fullName ?? cached.profile?.fullName ?? cached.profile_name ?? '';
              const cPicUrl = cached.profilePicUrl ?? cached.profilePicture ?? cached.profile_pic_url ??
                cached.profile_image_link ?? cached.profile?.profilePicUrl ?? cached.profile?.profilePicture ?? '';
              
              if (cFollowers > 0 || cPosts > 0 || cBio) {
                console.log(`✅ Found cached data for @${cleanUsername} in admin sync (followers: ${cFollowers})`);
                
                let finalPicUrl = '';
                const storagePicUrl = `${supabaseUrl}/storage/v1/object/public/profile-cache/profiles/${cleanUsername}.jpg`;
                const { data: cachedImg } = await supabase.storage
                  .from('profile-cache')
                  .list('profiles', { search: `${cleanUsername}.jpg` });
                
                if (cachedImg && cachedImg.length > 0) {
                  finalPicUrl = storagePicUrl;
                } else if (cPicUrl) {
                  finalPicUrl = proxyImage(cPicUrl);
                }
                
                const profile: InstagramProfile = {
                  username: cleanUsername,
                  fullName: cFullName,
                  bio: cBio,
                  followers: cFollowers,
                  following: cached.following ?? cached.profile?.following ?? 0,
                  posts: cPosts,
                  profilePicUrl: finalPicUrl,
                  isBusinessAccount: cached.isBusinessAccount ?? cached.profile?.isBusinessAccount ?? false,
                  category: cached.category ?? cached.profile?.category ?? '',
                  externalUrl: cached.externalUrl ?? cached.profile?.externalUrl ?? '',
                };
                
                return Response.json({
                  success: true,
                  profile: {
                    ...profile,
                    engagement: cached.engagement ?? 0,
                    avgLikes: cached.avgLikes ?? 0,
                    avgComments: cached.avgComments ?? 0,
                    recentPosts: cached.recentPosts ?? [],
                  },
                  simulated: false,
                  fromCache: true,
                  dataSource: 'admin_cache',
                  message: 'Dados carregados do cache administrativo. Tente sincronizar novamente mais tarde para dados atualizados.'
                }, { headers: corsHeaders });
              }
            }
          }
        } catch (cacheErr) {
          console.error('❌ Admin cache fallback failed:', cacheErr);
        }
        
        const isRestrictionConfirmed = detectedIsRestricted === true;
        console.log(
          `❌ Perfil @${cleanUsername} sem dados após tentativas e cache (restrição confirmada: ${isRestrictionConfirmed})`
        );

        return Response.json({
          success: false,
          error: isRestrictionConfirmed
            ? 'Este perfil possui restrição de idade e não pode ser acessado automaticamente.'
            : 'Não foi possível acessar este perfil agora. Tente novamente em alguns instantes.',
          canRetry: true,
          retryAfter: isRestrictionConfirmed ? 60 : 30,
          isRestricted: isRestrictionConfirmed,
          isPrivate: false,
          dataSource: 'bright'
        }, { headers: corsHeaders });
      }

      // Get the original profile image URL
      const originalProfilePic = profileData.profile_image_link || profileData.profile_pic_url || '';

      // Check if profile is private - we got data but it's limited
      if (detectedIsPrivate || profileData.is_private === true) {
        console.log(`🔒 Perfil @${cleanUsername} é privado - salvando dados parciais disponíveis`);
        
        // Cache profile picture to storage for private profiles too
        let finalProfilePicUrl = '';
        if (originalProfilePic) {
          const cachedUrl = await cacheImageToStorage(
            supabase,
            supabaseUrl,
            originalProfilePic,
            'profile-cache',
            `profiles/${cleanUsername}.jpg`
          );
          finalProfilePicUrl = cachedUrl || proxyImage(originalProfilePic);
        }
        
        const profile: InstagramProfile = {
          username: profileData.account || profileData.profile_name || cleanUsername,
          fullName: profileData.profile_name || profileData.full_name || '',
          bio: profileData.biography || profileData.bio || '',
          followers: profileData.followers || 0,
          following: profileData.following || 0,
          posts: profileData.posts_count || profileData.post_count || 0,
          profilePicUrl: finalProfilePicUrl,
          isBusinessAccount: profileData.is_business_account || profileData.is_professional_account || false,
          category: profileData.category || '',
          externalUrl: profileData.external_url || '',
        };

        return Response.json({
          success: true,
          profile: {
            ...profile,
            engagement: 0,
            avgLikes: 0,
            avgComments: 0,
            recentPosts: [], // Private profiles have no visible posts
          },
          simulated: false,
          isPrivate: true,
          message: 'Perfil privado - dados básicos carregados. Para rastrear posts e engajamento, torne o perfil público.'
        }, { headers: corsHeaders });
      }

      // Process successful profile data
      if (!onlyPosts && !originalProfilePic) {
        console.log('⚠️ No profile picture - loading anyway');
      }
      
      // Cache profile picture to Supabase Storage
      let finalProfilePicUrl = '';
      if (originalProfilePic) {
        console.log(`📸 Caching profile picture for ${cleanUsername}...`);
        const cachedUrl = await cacheImageToStorage(
          supabase,
          supabaseUrl,
          originalProfilePic,
          'profile-cache',
          `profiles/${cleanUsername}.jpg`
        );
        
        if (cachedUrl) {
          finalProfilePicUrl = cachedUrl;
          console.log(`✓ Profile picture cached: ${finalProfilePicUrl}`);
        } else {
          // Fallback to proxy if cache fails
          finalProfilePicUrl = proxyImage(originalProfilePic);
          console.log(`⚠ Using proxy fallback for profile picture`);
        }
      }
      
      const followersCount = profileData.followers || 0;
      
      if (!onlyPosts && followersCount === 0) {
        console.log('⚠️ Profile has 0 followers - loading anyway for growth tracking');
      }
      
      const postsCount = profileData.posts_count || profileData.post_count || 0;
      const avgEngagement = profileData.avg_engagement || 2.5;

      // Try to get real posts from the profile data
      let recentPosts: InstagramPost[] = [];
      
      if (profileData.posts && Array.isArray(profileData.posts) && profileData.posts.length > 0) {
        console.log('✅ Found real posts in profile data:', profileData.posts.length);
        recentPosts = profileData.posts.slice(0, 6).map((post: any, index: number) => ({
          id: post.id || post.pk || `post_${index}`,
          imageUrl: proxyImage(post.display_url || post.image_url || post.thumbnail_url),
          caption: post.caption || post.description || '',
          likes: post.likes_count || post.like_count || post.likes || 0,
          comments: post.comments_count || post.comment_count || post.comments || 0,
          timestamp: post.taken_at || post.timestamp || post.date_posted || post.datetime || new Date().toISOString(),
          hasHumanFace: post.has_human_face !== undefined ? post.has_human_face : true,
        }));
      }
      else if (profileData.latest_posts && Array.isArray(profileData.latest_posts) && profileData.latest_posts.length > 0) {
        console.log('✅ Found real latest_posts:', profileData.latest_posts.length);
        recentPosts = profileData.latest_posts.slice(0, 6).map((post: any, index: number) => ({
          id: post.id || post.pk || `post_${index}`,
          imageUrl: proxyImage(post.display_url || post.image_url || post.thumbnail_url || post.image),
          caption: post.caption || post.description || post.text || '',
          likes: post.likes_count || post.like_count || post.likes || 0,
          comments: post.comments_count || post.comment_count || post.comments || 0,
          timestamp: post.taken_at || post.timestamp || post.date_posted || post.datetime || new Date().toISOString(),
          hasHumanFace: post.has_human_face !== undefined ? post.has_human_face : true,
        }));
      }
      else if (existingPosts && Array.isArray(existingPosts) && existingPosts.length > 0) {
        console.log('✅ Keeping existing real posts (no new data from API)');
        recentPosts = existingPosts;
      }
      else {
        console.log('⚠️ No posts available in API response');
        recentPosts = [];
      }

      const avgLikes = Math.round(followersCount * (avgEngagement / 100));
      const avgComments = Math.round(avgLikes * 0.15);

      if (onlyPosts) {
        console.log('✅ onlyPosts mode - returning just posts data:', recentPosts.length, 'posts');
        return Response.json({
          success: true,
          profile: {
            recentPosts,
            avgLikes,
            avgComments,
            engagement: Math.min(avgEngagement, 15),
          },
          simulated: false,
          message: 'Posts atualizados via Bright Data API'
        }, { headers: corsHeaders });
      }

      const profile: InstagramProfile = {
        username: profileData.account || profileData.profile_name || cleanUsername,
        fullName: profileData.profile_name || profileData.full_name || '',
        bio: profileData.biography || profileData.bio || '',
        followers: followersCount,
        following: profileData.following || 0,
        posts: postsCount,
        profilePicUrl: finalProfilePicUrl,
        isBusinessAccount: profileData.is_business_account || profileData.is_professional_account || false,
        category: profileData.category || '',
        externalUrl: profileData.external_url || '',
      };

      console.log('✅ Profile found via Bright Data:', profile.username, profile.followers, 'posts:', recentPosts.length, 'hasPic:', !!finalProfilePicUrl);

      return Response.json({
        success: true,
        profile: {
          ...profile,
          engagement: Math.min(avgEngagement, 15),
          avgLikes,
          avgComments,
          recentPosts,
        },
        simulated: false,
        fromCache: false,
        dataSource,
        message: 'Dados reais do Instagram via Bright Data API'
      }, { headers: corsHeaders });

    } catch (e) {
      console.error('Bright Data API error:', e);
      return Response.json({ 
        success: false, 
        error: 'Erro de conexão com a API. Clique em "Tentar novamente".',
        canRetry: true
      }, { status: 500, headers: corsHeaders });
    }

  } catch (error) {
    console.error('Error fetching Instagram profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return Response.json(
      { success: false, error: 'Erro ao buscar perfil: ' + errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
});
