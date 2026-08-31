import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get the best URL to fetch (prefer weserv if already wrapped, otherwise wrap it)
const getBestFetchUrl = (url: string): string => {
  if (!url) return '';

  // If already a weserv URL, use it directly
  if (url.includes('images.weserv.nl')) {
    return url;
  }

  // If it's an Instagram CDN URL, wrap with weserv
  if (url.includes('instagram') || url.includes('cdninstagram') || url.includes('fbcdn')) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=200&h=200&fit=cover&output=jpg&q=85`;
  }

  // For other URLs, try direct fetch first
  if (url.startsWith('http')) {
    return url;
  }

  return '';
};

// REMOVED: No longer using dicebear fallback - only real images allowed

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.instagram.com/',
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

// Download and cache a single profile image with timeout.
// If the source image is 404/blocked, we cache a fallback avatar into our public bucket
// so the frontend never depends on external CDNs.
const cacheProfileImage = async (
  supabase: any,
  supabaseUrl: string,
  username: string,
  sourceUrl: string,
  forceRefresh: boolean = false
): Promise<{ username: string; success: boolean; url?: string; error?: string }> => {
  if (!username) {
    return { username, success: false, error: 'Missing username' };
  }

  const fileName = `${username.toLowerCase()}.jpg`;
  const folder = 'profiles';
  const objectPath = `${folder}/${fileName}`;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/profile-cache/${objectPath}`;

  // Check if already cached (skip if force refresh)
  if (!forceRefresh) {
    const { data: existing } = await supabase.storage
      .from('profile-cache')
      .list(folder, { search: fileName });

    if (existing && existing.length > 0) {
      return { username, success: true, url: publicUrl };
    }
  } else {
    // Delete existing file if force refresh
    await supabase.storage
      .from('profile-cache')
      .remove([objectPath]);
  }

  const candidates: string[] = [];

  if (sourceUrl) {
    const best = getBestFetchUrl(sourceUrl);
    if (best) candidates.push(best);
    // If we wrapped with weserv, also try the original as a fallback.
    if (best && best.includes('images.weserv.nl') && sourceUrl.startsWith('http')) {
      candidates.push(sourceUrl);
    }
  }

  const uniqueCandidates = Array.from(new Set(candidates)).filter(Boolean);

  const tryUploadFrom = async (url: string) => {
    const resp = await fetchWithTimeout(url, 15000);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.includes('image')) {
      throw new Error(`Not an image (${contentType})`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Verify we got actual image data (at least 1KB)
    if (bytes.length < 1024) {
      throw new Error(`Image too small (${bytes.length} bytes)`);
    }

    const { error: uploadError } = await supabase.storage
      .from('profile-cache')
      .upload(objectPath, bytes, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }
  };

  // 1) Try the real image URLs
  for (const url of uniqueCandidates) {
    try {
      await tryUploadFrom(url);
      console.log(`[cache] ${username}: ✓ Cached successfully`);
      return { username, success: true, url: publicUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[cache] ${username}: ${msg} - ${url.substring(0, 80)}...`);
    }
  }

  // No fallback - return failure if we couldn't cache the real image
  console.log(`[cache] ${username}: ✗ Failed to cache - no real image available`);
  return { username, success: false, url: '' };
};

// Process profiles in batches with concurrency control
const processBatch = async (
  supabase: any,
  supabaseUrl: string,
  profiles: Array<{ username: string; imageUrl: string }>,
  concurrency: number = 5,
  forceRefresh: boolean = false
): Promise<{ cached: number; failed: number; skipped: number; errors: string[] }> => {
  let cached = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  const processItem = async (profile: { username: string; imageUrl: string }) => {
    const result = await cacheProfileImage(supabase, supabaseUrl, profile.username, profile.imageUrl, forceRefresh);
    if (result.success) {
      if (result.url?.includes('profile-cache')) {
        cached++;
      } else {
        skipped++;
      }
    } else {
      failed++;
      if (result.error) {
        errors.push(`${profile.username}: ${result.error}`);
      }
    }
  };

  // Process with concurrency limit
  const queue = [...profiles];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          await processItem(item);
        }
      }
    })());
  }

  await Promise.all(workers);

  return { cached, failed, skipped, errors: errors.slice(0, 30) };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { action, batchSize = 50, offset = 0, forceRefresh = false } = body;

    // Load admin sync data
    const filePath = 'admin/sync-data.json';
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('user-data')
      .download(filePath);

    if (downloadError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin data not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = await fileData.text();
    const adminData = JSON.parse(text);
    const rawProfiles: any[] = Array.isArray(adminData?.profiles) ? adminData.profiles : [];

    // Extract unique profiles with image URLs
    const seen = new Set<string>();
    const allProfiles = rawProfiles
      .map((p) => {
        const username = String(p?.username ?? p?.profile?.username ?? '').trim().toLowerCase();
        const imageUrl = String(
          p?.profilePicUrl ??
            p?.profilePicture ??
            p?.profile_pic_url ??
            p?.profile_image_link ??
            p?.profile?.profilePicUrl ??
            p?.profile?.profilePicture ??
            ''
        ).trim();

        return { username, imageUrl };
      })
      .filter((p) => {
        if (!p.username || !p.imageUrl || seen.has(p.username)) return false;
        seen.add(p.username);
        return true;
      });

    const total = allProfiles.length;

    if (action === 'status') {
      // Count cached images
      const { data: cachedFiles } = await supabase.storage
        .from('profile-cache')
        .list('profiles', { limit: 2000 });

      const cachedCount = cachedFiles?.length || 0;

      return new Response(
        JSON.stringify({
          success: true,
          total,
          cached: cachedCount,
          remaining: total - cachedCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'process-batch') {
      const batch = allProfiles.slice(offset, offset + batchSize);
      
      console.log(`[cache-profile-images] Processing batch: offset=${offset}, size=${batch.length}, total=${total}`);
      
      // Log first few URLs for debugging
      if (offset === 0 && batch.length > 0) {
        console.log(`[cache-profile-images] Sample URLs:`);
        batch.slice(0, 3).forEach(p => {
          console.log(`  ${p.username}: ${p.imageUrl.substring(0, 100)}...`);
        });
      }

      const result = await processBatch(supabase, supabaseUrl, batch, 6, forceRefresh);

      const hasMore = offset + batchSize < total;

      return new Response(
        JSON.stringify({
          success: true,
          ...result,
          processed: batch.length,
          total,
          offset,
          hasMore,
          nextOffset: hasMore ? offset + batchSize : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'process-all') {
      const processAllInBackground = async () => {
        let currentOffset = 0;
        const batchSz = 30; // Smaller batches for better stability
        let totalCached = 0;
        let totalFailed = 0;

        while (currentOffset < total) {
          const batch = allProfiles.slice(currentOffset, currentOffset + batchSz);
          console.log(`[cache-profile-images] Background: processing ${currentOffset}-${currentOffset + batch.length} of ${total}`);
          
          const result = await processBatch(supabase, supabaseUrl, batch, 4, forceRefresh);
          totalCached += result.cached;
          totalFailed += result.failed;
          
          currentOffset += batchSz;
          
          // Delay between batches
          await new Promise(r => setTimeout(r, 1000));
        }

        console.log(`[cache-profile-images] Background complete: cached=${totalCached}, failed=${totalFailed}`);
      };

      // @ts-ignore
      if (typeof EdgeRuntime !== 'undefined') {
        // @ts-ignore
        EdgeRuntime.waitUntil(processAllInBackground());
      } else {
        processAllInBackground();
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Background caching started',
          total,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Use action: status, process-batch, or process-all',
        total,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[cache-profile-images] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
