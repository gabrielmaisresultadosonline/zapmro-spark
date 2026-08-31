import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, redirect_uri } = await req.json();

    const appId = Deno.env.get("FACEBOOK_APP_ID")!;
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "get-app-id") {
      return json({ app_id: appId });
    }

    if (action === "exchange-code") {
      if (!code || !redirect_uri) {
        throw new Error("code e redirect_uri são obrigatórios");
      }

      // Step 1: Exchange code for short-lived token via Instagram API
      const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri,
          code,
        }),
      });

      const tokenData = await tokenRes.json();
      console.log("[mro-direct-oauth] Token exchange response:", JSON.stringify(tokenData));

      if (!tokenRes.ok || tokenData.error_type || tokenData.error_message) {
        throw new Error(tokenData.error_message || "Erro ao trocar código por token");
      }

      const shortLivedToken = tokenData.access_token;
      const igUserId = tokenData.user_id;

      // Step 2: Exchange for long-lived token via Graph API
      const longLivedRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`
      );
      const longLivedData = await longLivedRes.json();
      console.log("[mro-direct-oauth] Long-lived token response:", JSON.stringify({ expires_in: longLivedData.expires_in }));

      const longLivedToken = longLivedData.access_token || shortLivedToken;

      // Step 3: Get Instagram profile info
      const profileRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url,followers_count,media_count&access_token=${longLivedToken}`
      );
      const profile = await profileRes.json();
      console.log("[mro-direct-oauth] Profile response:", JSON.stringify(profile));

      if (!profileRes.ok || profile.error) {
        throw new Error(profile.error?.message || "Erro ao buscar perfil do Instagram");
      }

      // Use the API node ID (profile.id) for Graph API calls, NOT user_id
      // profile.id = Instagram API node ID (works with graph.instagram.com/v21.0/{id})
      // profile.user_id = IG-scoped user ID (used for messaging recipient.id)
      const igAccountId = String(profile.id || igUserId);
      const igScopedUserId = profile.user_id || String(igUserId);

      // Step 4: Save settings to database
      const { data: existing } = await supabase
        .from("mro_direct_settings")
        .select("id")
        .limit(1)
        .single();

      const settingsData = {
        page_access_token: longLivedToken,
        instagram_account_id: igAccountId,
        instagram_user_id: igScopedUserId,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("mro_direct_settings").update(settingsData).eq("id", existing.id);
      } else {
        await supabase.from("mro_direct_settings").insert(settingsData);
      }

      return json({
        success: true,
        profile: {
          id: igAccountId,
          username: profile.username,
          name: profile.name,
          profile_picture_url: profile.profile_picture_url,
          followers_count: profile.followers_count,
          media_count: profile.media_count,
        },
      });
    }

    return json({ error: "Ação não reconhecida" }, 400);
  } catch (error) {
    console.error("[mro-direct-oauth] Error:", error);
    return json({ error: error.message }, 500);
  }
});
