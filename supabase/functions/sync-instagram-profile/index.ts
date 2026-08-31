import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bright Data API configuration
const BRIGHTDATA_API_URL = 'https://api.brightdata.com/datasets/v3/scrape';
const INSTAGRAM_PROFILES_DATASET_ID = 'gd_l1vikfch901nx3by4';

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { username, forceRefresh = false } = await req.json();

    if (!username) {
      return new Response(
        JSON.stringify({ success: false, error: "Username is required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[sync] forceRefresh: ${forceRefresh}`);

    // Clean username
    const cleanUsername = username
      .replace('@', '')
      .replace('https://instagram.com/', '')
      .replace('https://www.instagram.com/', '')
      .replace('/', '')
      .trim()
      .toLowerCase();

    console.log(`Syncing profile via Bright Data: ${cleanUsername}`);

    const BRIGHTDATA_TOKEN = Deno.env.get('BRIGHTDATA_API_TOKEN');
    
    if (!BRIGHTDATA_TOKEN) {
      console.error('BRIGHTDATA_API_TOKEN not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Token da Bright Data não configurado", 
          username: cleanUsername 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we have cached data first
    const cachedProfilePicUrl = `${supabaseUrl}/storage/v1/object/public/profile-cache/profiles/${cleanUsername}.jpg`;
    
    // Helper function to make Bright Data API call
    const callBrightDataAPI = async (attempt: number): Promise<Response> => {
      const profileUrl = `https://www.instagram.com/${cleanUsername}/`;
      console.log(`🔄 Bright Data API tentativa ${attempt}/2 para sync: ${profileUrl}`);
      
      return await fetch(`${BRIGHTDATA_API_URL}?dataset_id=${INSTAGRAM_PROFILES_DATASET_ID}&format=json`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BRIGHTDATA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: [{ url: profileUrl }]
        })
      });
    };

    // Helper function to process response
    const processBrightDataResponse = async (response: Response): Promise<any | null> => {
      if (!response.ok && response.status !== 202) {
        const errorText = await response.text();
        console.log(`❌ Bright Data API error:`, response.status, errorText.substring(0, 500));
        return null;
      }

      if (response.status === 202) {
        console.log('⏳ Bright Data returned 202 (async processing)');
        return null;
      }

      const data = await response.json();
      console.log('Bright Data sync response:', JSON.stringify(data).substring(0, 2000));
      
      const profileData = Array.isArray(data) ? data[0] : data;
      
      if (profileData && (profileData.followers !== undefined || profileData.id)) {
        return profileData;
      }
      
      console.log('❌ No valid profile data in sync response');
      return null;
    };

    try {
      let profileData = null;

      // ATTEMPT 1: First try
      try {
        const response1 = await callBrightDataAPI(1);
        profileData = await processBrightDataResponse(response1);
      } catch (e) {
        console.error('❌ Sync attempt 1 failed:', e);
      }

      // ATTEMPT 2: Second try if first failed
      if (!profileData) {
        console.log('⚠️ Primeira tentativa de sync falhou, tentando novamente...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        try {
          const response2 = await callBrightDataAPI(2);
          profileData = await processBrightDataResponse(response2);
        } catch (e) {
          console.error('❌ Sync attempt 2 failed:', e);
        }
      }

      // If still no data after 2 attempts
      if (!profileData) {
        console.log(`❌ Profile ${cleanUsername} não encontrado após 2 tentativas de sync`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Não conseguimos buscar dados do perfil. Tente novamente.", 
            username: cleanUsername,
            canRetry: true
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the original profile image URL
      const originalProfilePicUrl = profileData.profile_image_link || profileData.profile_pic_url || '';
      
      // Cache profile picture to storage
      let finalProfilePicUrl = null;
      if (originalProfilePicUrl) {
        const cachedUrl = await cacheImageToStorage(
          supabase,
          supabaseUrl,
          originalProfilePicUrl,
          'profile-cache',
          `profiles/${cleanUsername}.jpg`
        );
        
        if (cachedUrl) {
          finalProfilePicUrl = cachedUrl;
          console.log(`✓ Profile picture cached for ${cleanUsername}`);
        } else {
          // Use cached URL if exists, otherwise try proxy
          finalProfilePicUrl = cachedProfilePicUrl;
          console.log(`⚠ Using fallback cached URL for ${cleanUsername}`);
        }
      }

      const followersCount = profileData.followers || 0;
      const postsCount = profileData.posts_count || profileData.post_count || 0;
      
      // Allow 0 followers if profile has picture or posts (real profile)
      const hasRealData = originalProfilePicUrl || postsCount > 0 || followersCount > 0;
      
      if (!hasRealData) {
        console.log(`❌ Profile ${cleanUsername} has no real data (no picture, 0 posts, 0 followers)`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Não conseguimos buscar dados do perfil. Tente novamente.", 
            username: cleanUsername,
            canRetry: true
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process posts - get first 6 posts and cache their images
      let posts: any[] = [];
      const rawPosts = profileData.posts || profileData.recent_posts || [];
      
      if (Array.isArray(rawPosts)) {
        for (let i = 0; i < Math.min(rawPosts.length, 6); i++) {
          const post = rawPosts[i];
          const postId = post.id || post.shortcode || `post_${i}`;
          const originalImageUrl = post.thumbnail_url || post.display_url || post.image_url || '';
          
          // Cache post image to storage
          let finalPostImageUrl = null;
          if (originalImageUrl) {
            const cachedPostUrl = await cacheImageToStorage(
              supabase,
              supabaseUrl,
              originalImageUrl,
              'profile-cache',
              `posts/${cleanUsername}_${i}.jpg`
            );
            finalPostImageUrl = cachedPostUrl || null;
          }
          
          posts.push({
            id: postId,
            thumbnail: finalPostImageUrl,
            displayUrl: finalPostImageUrl,
            imageUrl: finalPostImageUrl,
            likes: post.likes || post.like_count || 0,
            comments: post.comments || post.comment_count || 0,
            caption: post.caption?.substring(0, 200) || '',
            timestamp: post.timestamp || post.taken_at || null
          });
        }
      }

      console.log(`📸 Cached ${posts.filter(p => p.imageUrl).length}/${posts.length} posts for ${cleanUsername}`);

      const profile = {
        username: profileData.account || profileData.profile_name || cleanUsername,
        followers: followersCount,
        following: profileData.following || 0,
        postsCount: postsCount,
        posts: posts,
        profilePicture: finalProfilePicUrl,
        profilePicUrl: finalProfilePicUrl,
        fullName: profileData.profile_name || profileData.full_name || cleanUsername,
        bio: profileData.biography || profileData.bio || "",
        externalUrl: profileData.external_url ? [profileData.external_url] : []
      };

      console.log(`✅ Profile ${cleanUsername} synced: ${profile.followers} followers, ${profile.postsCount} posts, ${posts.length} post images, hasPic: ${!!finalProfilePicUrl}`);

      return new Response(
        JSON.stringify({ success: true, profile }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (apiError) {
      console.error(`API error for ${cleanUsername}:`, apiError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Erro de conexão. Tente novamente.", 
          username: cleanUsername,
          canRetry: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in sync function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
