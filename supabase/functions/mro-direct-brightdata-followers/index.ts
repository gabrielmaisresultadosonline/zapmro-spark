import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (msg: string, data?: unknown) =>
  console.log(`[bd-followers] ${msg}`, data ? JSON.stringify(data) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "check";

    const { data: settings } = await supabase
      .from("mro_direct_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings) {
      return json({ success: false, error: "Settings not configured" });
    }

    // ── ACTIVATE: Set baseline ──
    if (action === "activate") {
      const username = body.username || settings.instagram_username;
      if (!username) return json({ success: false, error: "Instagram username required" });

      let currentCount = 0;
      if (settings.page_access_token && settings.instagram_account_id) {
        const baselineResult = await getFollowerCount(settings.instagram_account_id, settings.page_access_token);
        if (baselineResult.ok) {
          currentCount = baselineResult.count;
        } else {
          log("Falha ao obter baseline via Meta API", { error: baselineResult.error });
        }
      }

      // Seed known followers from session/Bright Data
      const followers = await scrapeFollowersList(username);
      const seeded = followers.slice(0, 20);

      if (seeded.length > 0 && settings.instagram_account_id) {
        const inserts = seeded.map((f) => ({
          instagram_account_id: settings.instagram_account_id!,
          follower_id: f.id,
          follower_username: f.username,
          welcomed: true,
        }));

        for (let i = 0; i < inserts.length; i += 50) {
          await supabase
            .from("mro_direct_known_followers")
            .upsert(inserts.slice(i, i + 50), { onConflict: "instagram_account_id,follower_id", ignoreDuplicates: true });
        }
      }

      await supabase.from("mro_direct_settings").update({
        follower_polling_active: true,
        follower_count_baseline: currentCount,
        instagram_username: username,
        last_follower_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", settings.id);

      return json({
        success: true,
        baseline: currentCount,
        seeded_followers: seeded.length,
        message: `Polling ativado! Baseline: ${currentCount} seguidores, ${seeded.length} seguidores registrados.`,
      });
    }

    // ── DEACTIVATE ──
    if (action === "deactivate") {
      await supabase.from("mro_direct_settings").update({
        follower_polling_active: false,
        updated_at: new Date().toISOString(),
      }).eq("id", settings.id);
      return json({ success: true, message: "Polling desativado" });
    }

    // ── STATUS ──
    if (action === "status") {
      const { count: knownCount } = await supabase
        .from("mro_direct_known_followers")
        .select("*", { count: "exact", head: true })
        .eq("instagram_account_id", settings.instagram_account_id || "unknown");

      const { count: unwelcomedCount } = await supabase
        .from("mro_direct_known_followers")
        .select("*", { count: "exact", head: true })
        .eq("instagram_account_id", settings.instagram_account_id || "unknown")
        .eq("welcomed", false);

      return json({
        success: true,
        polling_active: settings.follower_polling_active || false,
        baseline: settings.follower_count_baseline,
        last_check: settings.last_follower_check,
        username: settings.instagram_username,
        threshold: settings.follower_check_threshold || 1,
        known_followers: knownCount || 0,
        pending_welcome: unwelcomedCount || 0,
      });
    }

    // ── CHECK: Main polling logic ──
    if (!settings.follower_polling_active) {
      return json({ success: true, skipped: true, reason: "Polling not active" });
    }

    if (!settings.page_access_token || !settings.instagram_account_id) {
      return json({ success: false, error: "Token or IG ID not configured" });
    }

    const threshold = settings.follower_check_threshold || 1;

    // Always update last check time (even when Meta API fails)
    await supabase.from("mro_direct_settings").update({
      last_follower_check: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", settings.id);

    // STEP 1: Check follower count via Meta Graph API (FREE - no credits)
    const countResult = await getFollowerCount(settings.instagram_account_id, settings.page_access_token);

    if (!countResult.ok) {
      return json({ success: false, error: `Failed to fetch follower count from Meta API: ${countResult.error || "unknown"}` });
    }

    const currentCount = countResult.count;
    const baseline = settings.follower_count_baseline || 0;
    const diff = currentCount - baseline;

    log(`Count check: baseline=${baseline}, current=${currentCount}, diff=${diff}, threshold=${threshold}`);

    // If no increase, SKIP Bright Data (saves credits!)
    if (diff < threshold) {
      return json({
        success: true,
        checked: true,
        baseline,
        current: currentCount,
        diff,
        threshold,
        bright_data_called: false,
        message: `Sem novos seguidores (${diff}/${threshold}). Bright Data NÃO chamado.`,
      });
    }

    // STEP 2: Count INCREASED! Now use Bright Data/session to get follower list
    log(`🚀 ${diff} novos seguidores detectados! Buscando lista via Bright Data...`);

    const username = settings.instagram_username;
    if (!username) {
      return json({ success: false, error: "Instagram username not set" });
    }

    const scrapedFollowers = await scrapeFollowersList(username);

    if (scrapedFollowers.length === 0) {
      log("Bright Data/session retornou 0 seguidores");
      // Still update baseline to avoid re-triggering
      await supabase.from("mro_direct_settings").update({
        follower_count_baseline: currentCount,
        updated_at: new Date().toISOString(),
      }).eq("id", settings.id);
      return json({ success: true, checked: true, diff, scrape_failed: true, bright_data_called: true });
    }

    // STEP 3: Compare with known followers to find NEW ones
    const { data: knownFollowers } = await supabase
      .from("mro_direct_known_followers")
      .select("follower_id, follower_username")
      .eq("instagram_account_id", settings.instagram_account_id);

    const knownIds = new Set((knownFollowers || []).map((f) => f.follower_id));
    const knownUsernames = new Set(
      (knownFollowers || []).map((f) => f.follower_username?.toLowerCase()).filter(Boolean)
    );

    const newFollowers = scrapedFollowers.filter((f) => {
      return !knownIds.has(f.id) && !knownUsernames.has(f.username?.toLowerCase());
    });

    log(`${newFollowers.length} novos de ${scrapedFollowers.length} scrapeados`);

    // STEP 4: Insert new followers and try to get IGSID for DMs
    const newRecords = [];
    for (const follower of newFollowers.slice(0, 30)) {
      let followerId = follower.id;

      // Try business_discovery to get IGSID (needed for DMs)
      if (follower.username) {
        try {
          const discoveryRes = await fetch(
            `https://graph.facebook.com/v21.0/${settings.instagram_account_id}?fields=business_discovery.fields(id,username)&business_discovery=@${follower.username}&access_token=${settings.page_access_token}`
          );
          const discoveryData = await discoveryRes.json();
          if (discoveryRes.ok && discoveryData.business_discovery?.id) {
            followerId = discoveryData.business_discovery.id;
            log(`IGSID resolvido para @${follower.username}: ${followerId}`);
          }
        } catch (e) {
          log(`Erro resolvendo IGSID de @${follower.username}`);
        }
      }

      newRecords.push({
        instagram_account_id: settings.instagram_account_id,
        follower_id: followerId,
        follower_username: follower.username,
        welcomed: false,
      });
    }

    if (newRecords.length > 0) {
      await supabase
        .from("mro_direct_known_followers")
        .upsert(newRecords, { onConflict: "instagram_account_id,follower_id", ignoreDuplicates: true });
    }

    // STEP 5: Update baseline
    await supabase.from("mro_direct_settings").update({
      follower_count_baseline: currentCount,
      updated_at: new Date().toISOString(),
    }).eq("id", settings.id);

    // STEP 6: Trigger poll-followers to send welcome DMs
    try {
      await fetch(`${supabaseUrl}/functions/v1/mro-direct-poll-followers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({}),
      });
      log("Triggered poll-followers para enviar DMs de boas-vindas");
    } catch (e) {
      log("Erro ao triggerar poll-followers", { error: String(e) });
    }

    return json({
      success: true,
      checked: true,
      baseline,
      current: currentCount,
      diff,
      new_followers_detected: newRecords.length,
      bright_data_called: true,
      message: `🎉 ${newRecords.length} novos seguidores detectados e registrados! DMs sendo enviadas.`,
    });

  } catch (error) {
    log("Error", { error: String(error) });
    return json({ success: false, error: String(error) }, 500);
  }
});

// ── META GRAPH API: Get follower count (FREE) ──
async function getFollowerCount(
  igAccountId: string,
  accessToken: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  const endpoints = [
    {
      label: "graph.instagram.com/me",
      url: `https://graph.instagram.com/v21.0/me?fields=followers_count&access_token=${accessToken}`,
    },
    {
      label: "graph.facebook.com/{ig_account_id}",
      url: `https://graph.facebook.com/v21.0/${igAccountId}?fields=followers_count&access_token=${accessToken}`,
    },
  ];

  let lastError = "Unknown error";

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url);
      const data = await res.json().catch(() => null);
      const count = extractFollowerCount(data);

      if (res.ok && count !== null) {
        log(`Meta API (${endpoint.label}): followers_count = ${count}`);
        return { ok: true, count };
      }

      const apiError =
        (data as any)?.error?.message ||
        (res.ok ? "followers_count missing in response" : `HTTP ${res.status}`);

      log(`Meta API (${endpoint.label}) error`, {
        status: res.status,
        error: apiError,
      });

      lastError = `${endpoint.label}: ${apiError}`;
    } catch (e) {
      const msg = String(e);
      log(`Meta API (${endpoint.label}) exception`, { error: msg });
      lastError = `${endpoint.label}: ${msg}`;
    }
  }

  return { ok: false, count: -1, error: lastError };
}

function extractFollowerCount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;

  const root = payload as Record<string, unknown>;

  if (typeof root.followers_count === "number") return root.followers_count;
  if (typeof root.followers_count === "string") {
    const parsed = Number(root.followers_count);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (typeof nested.followers_count === "number") return nested.followers_count;
    if (typeof nested.followers_count === "string") {
      const parsed = Number(nested.followers_count);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  if (Array.isArray(root.data) && root.data.length > 0) {
    const first = root.data[0] as Record<string, unknown>;
    if (typeof first?.followers_count === "number") return first.followers_count;
    if (typeof first?.followers_count === "string") {
      const parsed = Number(first.followers_count);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

// ── SCRAPE FOLLOWERS LIST (Session Cookie → Bright Data fallback) ──
async function scrapeFollowersList(username: string): Promise<Array<{ id: string; username: string }>> {
  const sessionId = Deno.env.get("INSTAGRAM_SESSION_ID");

  // Method 1: Direct Instagram private API with session cookie
  if (sessionId) {
    log("Tentando via session cookie...");
    const result = await fetchFollowersViaPrivateAPI(username, sessionId);
    if (result.length > 0) {
      log(`Session cookie: ${result.length} seguidores obtidos`);
      return result;
    }
    log("Session cookie falhou, tentando Bright Data...");
  }

  // Method 2: Bright Data Web Unlocker
  const apiToken = Deno.env.get("BRIGHTDATA_API_TOKEN");
  if (apiToken) {
    log("Tentando via Bright Data Web Unlocker...");
    const result = await fetchFollowersViaBrightData(username, apiToken, sessionId);
    if (result.length > 0) {
      log(`Bright Data: ${result.length} seguidores obtidos`);
      return result;
    }
  }

  log("Nenhum método retornou seguidores");
  return [];
}

// Direct Instagram private API
async function fetchFollowersViaPrivateAPI(
  username: string,
  sessionId: string
): Promise<Array<{ id: string; username: string }>> {
  try {
    const headers = {
      "User-Agent": "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)",
      "X-IG-App-ID": "936619743392459",
      Cookie: `sessionid=${sessionId}`,
    };

    // Get user PK
    const profileRes = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      { headers }
    );
    if (!profileRes.ok) {
      const t = await profileRes.text();
      log("Profile fetch failed", { status: profileRes.status });
      return [];
    }

    const profileData = await profileRes.json();
    const userPk = profileData?.data?.user?.id;
    if (!userPk) {
      log("No user PK found");
      return [];
    }

    // Get followers list (most recent first)
    const followersRes = await fetch(
      `https://i.instagram.com/api/v1/friendships/${userPk}/followers/?count=50`,
      { headers }
    );
    if (!followersRes.ok) {
      const t = await followersRes.text();
      log("Followers fetch failed", { status: followersRes.status });
      return [];
    }

    const followersData = await followersRes.json();
    const users = followersData?.users || [];

    return users.map((u: any) => ({
      id: String(u.pk || u.pk_id),
      username: u.username,
    }));
  } catch (e) {
    log("Private API error", { error: String(e) });
    return [];
  }
}

// Bright Data Web Unlocker approach
async function fetchFollowersViaBrightData(
  username: string,
  apiToken: string,
  sessionId: string | undefined
): Promise<Array<{ id: string; username: string }>> {
  try {
    const zone = Deno.env.get("BRIGHTDATA_WEB_UNLOCKER_ZONE") || "web_unlocker1";

    const igHeaders: Record<string, string> = {
      "User-Agent": "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)",
      "X-IG-App-ID": "936619743392459",
    };
    if (sessionId) {
      igHeaders["Cookie"] = `sessionid=${sessionId}`;
    }

    // Step 1: Get user PK via Bright Data proxy
    const profileUrl = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

    // Use Bright Data's SERP/Web Unlocker API endpoint
    const proxyAuth = btoa(`brd-customer-hl_4b49de84-zone-${zone}:${apiToken}`);

    const profileRes = await fetch("https://brd.superproxy.io:33335", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Proxy-Authorization": `Basic ${proxyAuth}`,
      },
      body: JSON.stringify({
        url: profileUrl,
        headers: igHeaders,
      }),
    }).catch(() => null);

    if (!profileRes || !profileRes.ok) {
      // Fallback: try the Bright Data API directly
      log("Bright Data proxy failed, trying API endpoint...");
      return await fetchFollowersViaBrightDataAPI(username, apiToken);
    }

    const profileData = await profileRes.json().catch(() => null);
    const userPk = profileData?.data?.user?.id;

    if (!userPk) {
      log("No PK from Bright Data proxy");
      return await fetchFollowersViaBrightDataAPI(username, apiToken);
    }

    // Step 2: Get followers via Bright Data proxy
    const followersUrl = `https://i.instagram.com/api/v1/friendships/${userPk}/followers/?count=50`;

    const followersRes = await fetch("https://brd.superproxy.io:33335", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Proxy-Authorization": `Basic ${proxyAuth}`,
      },
      body: JSON.stringify({
        url: followersUrl,
        headers: igHeaders,
      }),
    }).catch(() => null);

    if (!followersRes || !followersRes.ok) {
      log("Bright Data followers fetch failed");
      return [];
    }

    const followersData = await followersRes.json().catch(() => null);
    const users = followersData?.users || [];

    return users.map((u: any) => ({
      id: String(u.pk || u.pk_id),
      username: u.username,
    }));
  } catch (e) {
    log("Bright Data error", { error: String(e) });
    return [];
  }
}

// Bright Data Web Scraper API fallback (async trigger, stores snapshot)
async function fetchFollowersViaBrightDataAPI(
  username: string,
  apiToken: string
): Promise<Array<{ id: string; username: string }>> {
  try {
    // Use synchronous scrape endpoint for profile data
    const res = await fetch(
      "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1vikfch901nx3by4&format=json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify([{ url: `https://www.instagram.com/${username}/` }]),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      log("Bright Data API scrape failed", { status: res.status, body: errText.substring(0, 200) });
      return [];
    }

    // The profiles dataset doesn't return follower list, just profile info
    // This is a fallback that at least confirms the profile exists
    const data = await res.json();
    log("Bright Data API profile scraped", { records: Array.isArray(data) ? data.length : 0 });

    // Profile scrape doesn't give us individual followers - return empty
    // The main detection is done via Meta API count comparison
    return [];
  } catch (e) {
    log("Bright Data API error", { error: String(e) });
    return [];
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
