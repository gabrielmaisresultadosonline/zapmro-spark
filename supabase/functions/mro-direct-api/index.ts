import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to resolve User Token → Page Token + IG Account ID
async function resolveInstagramAccount(userToken: string) {
  // Step 1: Get pages linked to the user
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`
  );
  const pagesData = await pagesRes.json();
  
  if (!pagesRes.ok) {
    throw new Error(pagesData.error?.message || "Erro ao buscar páginas do Facebook");
  }
  
  if (!pagesData.data || pagesData.data.length === 0) {
    throw new Error("Nenhuma página do Facebook encontrada. Certifique-se de ter uma página vinculada ao seu Instagram.");
  }

  // Find the first page with an Instagram Business Account
  let page = null;
  for (const p of pagesData.data) {
    if (p.instagram_business_account) {
      page = p;
      break;
    }
  }

  if (!page) {
    // Try fetching IG account for each page individually
    for (const p of pagesData.data) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${p.id}?fields=instagram_business_account&access_token=${p.access_token}`
      );
      const igData = await igRes.json();
      if (igData.instagram_business_account) {
        page = { ...p, instagram_business_account: igData.instagram_business_account };
        break;
      }
    }
  }

  if (!page || !page.instagram_business_account) {
    throw new Error("Nenhuma conta Instagram Business vinculada às suas páginas do Facebook.");
  }

  const igAccountId = page.instagram_business_account.id;
  const pageAccessToken = page.access_token;

  // Step 2: Get Instagram profile info
  const profileRes = await fetch(
    `https://graph.facebook.com/v21.0/${igAccountId}?fields=id,name,biography,ig_id,followers_count,media_count&access_token=${pageAccessToken}`
  );
  const profile = await profileRes.json();

  if (!profileRes.ok) {
    throw new Error(profile.error?.message || "Erro ao buscar perfil do Instagram");
  }

  return {
    profile,
    igAccountId,
    pageAccessToken,
    pageName: page.name,
    pageId: page.id,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...data } = await req.json();

    // ── SETTINGS ──
    if (action === "get-settings") {
      const { data: settings } = await supabase
        .from("mro_direct_settings")
        .select("*")
        .limit(1)
        .single();
      return json({ settings });
    }

    if (action === "save-settings") {
      const { instagram_account_id, page_access_token, is_active, user_token } = data;

      const { data: existing } = await supabase.from("mro_direct_settings").select("id").limit(1).single();

      const updateData: any = { updated_at: new Date().toISOString() };
      if (instagram_account_id !== undefined) updateData.instagram_account_id = instagram_account_id;
      if (page_access_token !== undefined) updateData.page_access_token = page_access_token;
      if (is_active !== undefined) updateData.is_active = is_active;

      if (existing) {
        const { error } = await supabase
          .from("mro_direct_settings")
          .update(updateData)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mro_direct_settings")
          .insert({ 
            instagram_account_id: instagram_account_id || "",
            page_access_token: page_access_token || "",
            is_active: is_active ?? true,
          });
        if (error) throw error;
      }
      return json({ success: true });
    }

    // ── AUTOMATIONS ──
    if (action === "list-automations") {
      const { data: automations } = await supabase
        .from("mro_direct_automations")
        .select("*")
        .order("created_at", { ascending: false });
      return json({ automations: automations || [] });
    }

    if (action === "create-automation") {
      const { automation_type, reply_message, trigger_keywords, target_post_id, delay_seconds, response_mode, ai_prompt, comment_reply_text } = data;
      const { error } = await supabase.from("mro_direct_automations").insert({
        automation_type,
        reply_message: reply_message || "(via I.A)",
        trigger_keywords: trigger_keywords || [],
        target_post_id: target_post_id || null,
        delay_seconds: delay_seconds || 0,
        response_mode: response_mode || "manual",
        ai_prompt: ai_prompt || null,
        comment_reply_text: comment_reply_text || null,
      });
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "update-automation") {
      const { id, ...fields } = data;
      fields.updated_at = new Date().toISOString();
      const { error } = await supabase.from("mro_direct_automations").update(fields).eq("id", id);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "delete-automation") {
      const { error } = await supabase.from("mro_direct_automations").delete().eq("id", data.id);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "toggle-automation") {
      const { error } = await supabase
        .from("mro_direct_automations")
        .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw error;
      return json({ success: true });
    }

    // ── LOGS ──
    if (action === "get-logs") {
      const { data: logs } = await supabase
        .from("mro_direct_logs")
        .select("*, mro_direct_automations(automation_type, reply_message)")
        .order("created_at", { ascending: false })
        .limit(100);
      return json({ logs: logs || [] });
    }

    // ── SEND TEST MESSAGE ──
    if (action === "send-test-message") {
      const { data: settings } = await supabase.from("mro_direct_settings").select("*").limit(1).single();
      if (!settings?.page_access_token || !settings?.instagram_account_id) {
        throw new Error("Configure o token e ID do Instagram primeiro");
      }

      const { recipient_id, message } = data;

      const igResponse = await fetch(
        `https://graph.facebook.com/v21.0/${settings.instagram_account_id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: recipient_id },
            message: { text: message },
            access_token: settings.page_access_token,
          }),
        }
      );

      const result = await igResponse.json();

      if (!igResponse.ok) {
        throw new Error(result.error?.message || "Erro ao enviar mensagem");
      }

      await supabase.from("mro_direct_logs").insert({
        event_type: "test_message",
        sender_id: recipient_id,
        message_sent: message,
        status: "sent",
      });

      return json({ success: true, result });
    }

    // ── GET INSTAGRAM PROFILE INFO (supports User Token) ──
    if (action === "get-ig-info") {
      const { data: settings } = await supabase.from("mro_direct_settings").select("*").limit(1).single();
      if (!settings?.page_access_token) {
        throw new Error("Token não configurado");
      }

      const token = settings.page_access_token;

      // Try resolving as a User Token first (gets pages → IG account)
      try {
        const resolved = await resolveInstagramAccount(token);
        
        // Update settings with the resolved Page Access Token and IG Account ID
        await supabase
          .from("mro_direct_settings")
          .update({
            page_access_token: resolved.pageAccessToken,
            instagram_account_id: resolved.igAccountId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", settings.id);

        return json({ 
          info: resolved.profile,
          resolved: true,
          page_name: resolved.pageName,
        });
      } catch (resolveError) {
        // If User Token resolution fails, try direct Instagram API call (Page Token)
        console.log("User token resolution failed, trying as page token:", resolveError.message);
        
        const res = await fetch(
          `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token}`
        );
        const info = await res.json();
        if (!res.ok) throw new Error(info.error?.message || "Erro ao buscar perfil");
        
        return json({ info });
      }
    }

    // ── DASHBOARD STATS ──
    if (action === "get-stats") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count: totalSent } = await supabase
        .from("mro_direct_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent");

      const { count: todaySent } = await supabase
        .from("mro_direct_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", today);

      const { count: weekSent } = await supabase
        .from("mro_direct_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", weekAgo);

      const { count: errors } = await supabase
        .from("mro_direct_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "error");

      const { count: activeAutomations } = await supabase
        .from("mro_direct_automations")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      return json({
        stats: {
          totalSent: totalSent || 0,
          todaySent: todaySent || 0,
          weekSent: weekSent || 0,
          errors: errors || 0,
          activeAutomations: activeAutomations || 0,
        },
      });
    }

    // ── FOLLOWER WEBHOOK STATUS ──
    // ── LIST INSTAGRAM POSTS ──
    if (action === "list-posts") {
      const { data: settings } = await supabase.from("mro_direct_settings").select("*").limit(1).single();
      if (!settings?.page_access_token || !settings?.instagram_account_id) {
        throw new Error("Token ou ID do Instagram não configurado");
      }
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${settings.instagram_account_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count&limit=25&access_token=${settings.page_access_token}`
      );
      const postsData = await res.json();
      if (!res.ok) throw new Error(postsData.error?.message || "Erro ao buscar posts");
      return json({ posts: postsData.data || [] });
    }

    if (action === "follower-polling-status") {
      const { data: s } = await supabase.from("mro_direct_settings").select("*").limit(1).single();
      const { count: known } = await supabase
        .from("mro_direct_known_followers")
        .select("*", { count: "exact", head: true })
        .eq("instagram_account_id", s?.instagram_account_id || "");
      const { count: pending } = await supabase
        .from("mro_direct_known_followers")
        .select("*", { count: "exact", head: true })
        .eq("instagram_account_id", s?.instagram_account_id || "")
        .eq("welcomed", false);
      return json({
        polling_active: s?.follower_polling_active || false,
        baseline: s?.follower_count_baseline || 0,
        username: s?.instagram_username || "",
        last_check: s?.last_follower_check,
        known_followers: known || 0,
        pending_welcome: pending || 0,
      });
    }

    if (action === "follower-polling-activate") {
      const username = data.username as string;
      const { data: s } = await supabase.from("mro_direct_settings").select("*").limit(1).single();
      if (!s) throw new Error("Settings não encontradas");

      // Get current follower count from Graph API
      let baseline = 0;
      if (s.page_access_token && s.instagram_account_id) {
        const igRes = await fetch(
          `https://graph.facebook.com/v21.0/${s.instagram_account_id}?fields=followers_count&access_token=${s.page_access_token}`
        );
        const igData = await igRes.json();
        if (igData.followers_count) baseline = igData.followers_count;
      }

      await supabase.from("mro_direct_settings").update({
        follower_polling_active: true,
        instagram_username: username,
        follower_count_baseline: baseline,
        last_follower_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", s.id);

      return json({ success: true, message: `Webhook ativado! Baseline: ${baseline} seguidores. Novos seguidores serão detectados em tempo real.` });
    }

    if (action === "follower-polling-deactivate") {
      const { data: s } = await supabase.from("mro_direct_settings").select("id").limit(1).single();
      if (s) {
        await supabase.from("mro_direct_settings").update({
          follower_polling_active: false,
          updated_at: new Date().toISOString(),
        }).eq("id", s.id);
      }
      return json({ success: true, message: "Detecção desativada" });
    }

    // ── CONVERSATIONS (grouped by sender_id) ──
    if (action === "get-conversations") {
      const { data: logs } = await supabase
        .from("mro_direct_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      // Group by sender_id
      const convMap = new Map<string, any>();
      for (const log of (logs || [])) {
        if (!log.sender_id) continue;
        if (!convMap.has(log.sender_id)) {
          convMap.set(log.sender_id, {
            sender_id: log.sender_id,
            sender_username: log.sender_username,
            messages: [],
            last_message_at: log.created_at,
          });
        }
        convMap.get(log.sender_id).messages.push(log);
      }

      // Sort conversations by last message
      const conversations = Array.from(convMap.values())
        .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

      // Get AI pause states
      const senderIds = conversations.map(c => c.sender_id);
      const { data: pauses } = await supabase
        .from("mro_direct_ai_pauses")
        .select("sender_id, is_paused")
        .in("sender_id", senderIds.length > 0 ? senderIds : ["__none__"]);

      const pauseMap = new Map((pauses || []).map(p => [p.sender_id, p.is_paused]));
      for (const conv of conversations) {
        conv.ai_paused = pauseMap.get(conv.sender_id) || false;
      }

      return json({ conversations });
    }

    // ── TOGGLE AI PAUSE ──
    if (action === "toggle-ai-pause") {
      const { sender_id, paused } = data;
      if (!sender_id) throw new Error("sender_id é obrigatório");

      const { data: existing } = await supabase
        .from("mro_direct_ai_pauses")
        .select("id")
        .eq("sender_id", sender_id)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase.from("mro_direct_ai_pauses").update({
          is_paused: paused,
          paused_at: paused ? new Date().toISOString() : null,
        }).eq("id", existing.id);
      } else {
        await supabase.from("mro_direct_ai_pauses").insert({
          sender_id,
          is_paused: paused,
          paused_at: paused ? new Date().toISOString() : null,
        });
      }

      return json({ success: true, paused });
    }

    return json({ error: "Ação não reconhecida" }, 400);
  } catch (error) {
    console.error("[mro-direct-api] Error:", error);
    return json({ error: error.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
