import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── WEBHOOK VERIFICATION (GET) ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe") {
      const { data: settings } = await supabase
        .from("mro_direct_settings")
        .select("webhook_verify_token")
        .limit(1)
        .single();

      if (settings && token === settings.webhook_verify_token) {
        return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      }
    }

    return new Response("Forbidden", { status: 403 });
  }

  // ── WEBHOOK EVENTS (POST) ──
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("[mro-direct-webhook] Received:", JSON.stringify(body));

      const { data: settings } = await supabase
        .from("mro_direct_settings")
        .select("*")
        .limit(1)
        .single();

      if (!settings?.is_active || !settings?.page_access_token) {
        console.log("[mro-direct-webhook] Not active or no token, skipping");
        return new Response("OK", { status: 200 });
      }

      for (const entry of body.entry || []) {
        // ── MESSAGING (DMs + Story replies) ──
        for (const messaging of entry.messaging || []) {
          if (messaging.message && !messaging.message.is_echo) {
            // Check if it's a story reply (has reply_to with story info)
            const isStoryReply = messaging.message?.reply_to?.story?.id || messaging.message?.referral?.ref === "story";
            
            if (isStoryReply) {
              await handleStoryReply(supabase, settings, messaging);
            } else {
              await handleDirectMessage(supabase, settings, messaging);
            }
          }
        }

        // ── CHANGES (Comments) ──
        for (const change of entry.changes || []) {
          if (change.field === "comments") {
            await handleComment(supabase, settings, change.value);
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("[mro-direct-webhook] Error:", error);
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

// ── Generate AI response using Lovable AI ──
async function generateAIResponse(prompt: string, userMessage: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("[mro-direct-webhook] LOVABLE_API_KEY not configured");
    return "(Erro: I.A não configurada)";
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${prompt}\n\nIMPORTANTE: Responda de forma curta e direta, como uma mensagem de DM do Instagram (máximo 300 caracteres). Não use markdown. Seja natural e humano.` },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[mro-direct-webhook] AI error:", response.status, errorText);
      return "(Erro ao gerar resposta da I.A)";
    }

    const data = await response.json();
    const aiReply = data.choices?.[0]?.message?.content?.trim();
    return aiReply || "(Sem resposta da I.A)";
  } catch (error) {
    console.error("[mro-direct-webhook] AI fetch error:", error);
    return "(Erro de conexão com I.A)";
  }
}

// ── Get response message (manual or AI) ──
async function getResponseMessage(auto: any, triggerText: string): Promise<string> {
  if (auto.response_mode === "ai" && auto.ai_prompt) {
    return await generateAIResponse(auto.ai_prompt, triggerText);
  }
  return auto.reply_message;
}

async function handleDirectMessage(supabase: any, settings: any, messaging: any) {
  const senderId = messaging.sender.id;
  const messageText = messaging.message.text || "";

  console.log("[mro-direct-webhook] DM from:", senderId, "Text:", messageText);

  // Log incoming message for real-time inbox
  await supabase.from("mro_direct_logs").insert({
    event_type: "dm_received",
    sender_id: senderId,
    sender_username: null,
    trigger_content: messageText,
    incoming_text: messageText,
    direction: "incoming",
    status: "received",
    message_sent: null,
  });

  // Register as known follower
  await supabase.from("mro_direct_known_followers").upsert(
    { instagram_account_id: settings.instagram_account_id, follower_id: senderId, follower_username: null, welcomed: false },
    { onConflict: "instagram_account_id,follower_id", ignoreDuplicates: true }
  );

  // Check if AI is paused for this sender
  const { data: pauseCheck } = await supabase
    .from("mro_direct_ai_pauses")
    .select("id")
    .eq("sender_id", senderId)
    .eq("is_paused", true)
    .limit(1);

  if (pauseCheck && pauseCheck.length > 0) {
    console.log("[mro-direct-webhook] AI paused for sender:", senderId, "- skipping auto reply");
    return;
  }

  const { data: automations } = await supabase
    .from("mro_direct_automations")
    .select("*")
    .eq("automation_type", "dm_reply")
    .eq("is_active", true);

  for (const auto of automations || []) {
    const keywords = auto.trigger_keywords || [];
    const shouldReply = keywords.length === 0 || keywords.some((kw: string) => messageText.toLowerCase().includes(kw.toLowerCase()));

    if (shouldReply) {
      if (auto.delay_seconds > 0) await new Promise((r) => setTimeout(r, auto.delay_seconds * 1000));
      
      const responseMessage = await getResponseMessage(auto, messageText);
      await sendInstagramMessage(supabase, settings, senderId, responseMessage, auto.id, "dm_reply", messageText);
      break;
    }
  }
}

async function handleComment(supabase: any, settings: any, commentData: any) {
  const commenterId = commentData.from?.id;
  const commentText = commentData.text || "";
  const mediaId = commentData.media?.id;
  const commentId = commentData.id;

  if (!commenterId) return;

  console.log("[mro-direct-webhook] Comment from:", commenterId, "on media:", mediaId);

  const { data: automations } = await supabase
    .from("mro_direct_automations")
    .select("*")
    .eq("automation_type", "comment_reply")
    .eq("is_active", true);

  for (const auto of automations || []) {
    if (auto.target_post_id && auto.target_post_id !== mediaId) continue;

    const keywords = auto.trigger_keywords || [];
    const shouldReply = keywords.length === 0 || keywords.some((kw: string) => commentText.toLowerCase().includes(kw.toLowerCase()));

    if (shouldReply) {
      if (auto.delay_seconds > 0) await new Promise((r) => setTimeout(r, auto.delay_seconds * 1000));

      // Reply to the comment itself if comment_reply_text is set
      if (auto.comment_reply_text && commentId) {
        await replyToComment(settings, commentId, auto.comment_reply_text);
      }

      // Send DM
      const responseMessage = await getResponseMessage(auto, commentText);
      await sendInstagramMessage(supabase, settings, commenterId, responseMessage, auto.id, "comment_reply", commentText);
      break;
    }
  }
}

async function handleStoryReply(supabase: any, settings: any, messaging: any) {
  const senderId = messaging.sender.id;
  const messageText = messaging.message.text || "(story reaction)";

  console.log("[mro-direct-webhook] Story reply from:", senderId, "Text:", messageText);

  // Log incoming story reply
  await supabase.from("mro_direct_logs").insert({
    event_type: "story_received",
    sender_id: senderId,
    trigger_content: messageText,
    incoming_text: messageText,
    direction: "incoming",
    status: "received",
    message_sent: null,
  });

  const { data: automations } = await supabase
    .from("mro_direct_automations")
    .select("*")
    .eq("automation_type", "story_reply")
    .eq("is_active", true);

  for (const auto of automations || []) {
    const keywords = auto.trigger_keywords || [];
    const shouldReply = keywords.length === 0 || keywords.some((kw: string) => messageText.toLowerCase().includes(kw.toLowerCase()));

    if (shouldReply) {
      if (auto.delay_seconds > 0) await new Promise((r) => setTimeout(r, auto.delay_seconds * 1000));

      const responseMessage = await getResponseMessage(auto, messageText);
      await sendInstagramMessage(supabase, settings, senderId, responseMessage, auto.id, "story_reply", messageText);
      break;
    }
  }
}

async function replyToComment(settings: any, commentId: string, replyText: string) {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${commentId}/replies`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: replyText,
          access_token: settings.page_access_token,
        }),
      }
    );
    const result = await res.json();
    if (!res.ok) {
      console.error("[mro-direct-webhook] Comment reply error:", result);
    } else {
      console.log("[mro-direct-webhook] Comment reply sent to:", commentId);
    }
  } catch (error) {
    console.error("[mro-direct-webhook] Comment reply error:", error);
  }
}

async function sendInstagramMessage(
  supabase: any,
  settings: any,
  recipientId: string,
  message: string,
  automationId: string | null,
  eventType: string,
  triggerContent: string
) {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${settings.instagram_account_id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          access_token: settings.page_access_token,
        }),
      }
    );

    const result = await res.json();

    await supabase.from("mro_direct_logs").insert({
      automation_id: automationId,
      event_type: eventType,
      sender_id: recipientId,
      message_sent: message,
      trigger_content: triggerContent,
      status: res.ok ? "sent" : "error",
      error_message: res.ok ? null : (result.error?.message || "Unknown error"),
    });

    if (!res.ok) {
      console.error("[mro-direct-webhook] Send error:", result);
    } else {
      console.log("[mro-direct-webhook] Message sent to:", recipientId);
    }
  } catch (error) {
    console.error("[mro-direct-webhook] Send error:", error);
    await supabase.from("mro_direct_logs").insert({
      automation_id: automationId,
      event_type: eventType,
      sender_id: recipientId,
      message_sent: message,
      trigger_content: triggerContent,
      status: "error",
      error_message: error.message,
    });
  }
}
