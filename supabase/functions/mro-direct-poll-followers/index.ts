import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (msg: string, data?: unknown) =>
  console.log(`[poll-followers] ${msg}`, data ? JSON.stringify(data) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get active settings
    const { data: settings } = await supabase
      .from("mro_direct_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings?.is_active || !settings?.page_access_token || !settings?.instagram_account_id) {
      log("Not active or missing config, skipping");
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active welcome_follower automations
    const { data: automations } = await supabase
      .from("mro_direct_automations")
      .select("*")
      .eq("automation_type", "welcome_follower")
      .eq("is_active", true);

    if (!automations || automations.length === 0) {
      log("No active welcome_follower automations");
      return new Response(JSON.stringify({ success: true, no_automations: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Instagram Business API does NOT provide a /followers list endpoint.
    // Instead, we track followers_count changes and send welcome DMs
    // to users who interact (DM/comment) for the first time.
    // 
    // This function checks for "unwelcomed" followers that were recorded
    // by the webhook (mro-direct-webhook) when they first interacted,
    // and sends them the welcome message.

    const { data: unwelcomed } = await supabase
      .from("mro_direct_known_followers")
      .select("*")
      .eq("instagram_account_id", settings.instagram_account_id)
      .eq("welcomed", false)
      .limit(50);

    if (!unwelcomed || unwelcomed.length === 0) {
      log("No unwelcomed followers to process");
      return new Response(JSON.stringify({ success: true, pending: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Processing unwelcomed followers", { count: unwelcomed.length });

    let welcomeSent = 0;

    for (const follower of unwelcomed) {
      for (const auto of automations) {
        if (auto.delay_seconds > 0) {
          await new Promise((r) => setTimeout(r, auto.delay_seconds * 1000));
        }

        try {
          const msgRes = await fetch(
            `https://graph.instagram.com/v21.0/${settings.instagram_account_id}/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: follower.follower_id },
                message: { text: auto.reply_message },
                access_token: settings.page_access_token,
              }),
            }
          );

          const msgResult = await msgRes.json();

          await supabase.from("mro_direct_logs").insert({
            automation_id: auto.id,
            event_type: "welcome_follower",
            sender_id: follower.follower_id,
            sender_username: follower.follower_username,
            message_sent: auto.reply_message,
            trigger_content: "new_follower_poll",
            status: msgRes.ok ? "sent" : "error",
            error_message: msgRes.ok ? null : (msgResult.error?.message || "Unknown error"),
          });

          if (msgRes.ok) {
            welcomeSent++;
            await supabase
              .from("mro_direct_known_followers")
              .update({ welcomed: true })
              .eq("id", follower.id);
            log("Welcome sent to", { id: follower.follower_id, username: follower.follower_username });
          } else {
            log("Error sending welcome", msgResult.error);
          }
        } catch (e) {
          log("Exception sending welcome", { error: String(e) });
          await supabase.from("mro_direct_logs").insert({
            automation_id: auto.id,
            event_type: "welcome_follower",
            sender_id: follower.follower_id,
            sender_username: follower.follower_username,
            message_sent: auto.reply_message,
            trigger_content: "new_follower_poll",
            status: "error",
            error_message: String(e),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: unwelcomed.length,
        welcome_sent: welcomeSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log("Error", { error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
