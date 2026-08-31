import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  limit?: number;
  offset?: number;
};

type ActiveClient = {
  username: string;
  profilePicture: string;
  followers: number;
};

const safeNumber = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: Body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(safeNumber(body.limit, 60), 1), 200);
    const offset = Math.max(safeNumber(body.offset, 0), 0);

    console.log('[get-active-clients] Loading admin sync-data.json...', { limit, offset });

    // Read from the same cloud file the admin uses (admin/sync-data.json)
    const filePath = 'admin/sync-data.json';
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('user-data')
      .download(filePath);

    if (downloadError) {
      const msg = downloadError.message || '';
      const isNotFound = msg.includes('not found') || msg.includes('Object not found');
      console.log('[get-active-clients] No admin data found', { isNotFound, msg });

      return new Response(
        JSON.stringify({ success: true, clients: [], total: 0, hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = await fileData.text();
    const adminData = JSON.parse(text);

    const rawProfiles: any[] = Array.isArray(adminData?.profiles) ? adminData.profiles : [];

    // Always prefer the cached image in Storage (profile-cache/profiles/{username}.jpg).
    // This avoids needing to list the entire bucket (which may be paginated/limited) and
    // guarantees consistent loading after the admin pre-cache job is complete.
    const getImageUrl = (username: string, originalUrl: string): string => {
      const lowerUsername = String(username || '').trim().toLowerCase();

      if (lowerUsername) {
        return `${supabaseUrl}/storage/v1/object/public/profile-cache/profiles/${encodeURIComponent(lowerUsername)}.jpg`;
      }

      // Fallback (should be rare): proxy original URL
      if (!originalUrl) return '';
      if (originalUrl.includes('images.weserv.nl')) return originalUrl;

      try {
        const encoded = encodeURIComponent(originalUrl);
        return `https://images.weserv.nl/?url=${encoded}&w=200&h=200&fit=cover&output=webp`;
      } catch {
        return originalUrl;
      }
    };

    const mapped = rawProfiles
      .map((p) => {
        const username = String(p?.username ?? '').trim();
        const originalPic = String(p?.profilePicUrl ?? '').trim();
        const pic = getImageUrl(username, originalPic);

        return {
          username,
          profilePicture: pic,
          followers: safeNumber(p?.followers, 0),
        };
      })
      .filter((p) => p.username && p.followers > 0);

    // De-duplicate by username
    const seen = new Set<string>();
    const unique = mapped.filter((p) => {
      const key = p.username.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by followers desc
    unique.sort((a, b) => b.followers - a.followers);

    const total = unique.length;
    const page = unique.slice(offset, offset + limit);

    const hasMore = offset + limit < total;

    console.log('[get-active-clients] Returning page', { total, count: page.length, hasMore });

    return new Response(
      JSON.stringify({ success: true, clients: page, total, hasMore }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[get-active-clients] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
