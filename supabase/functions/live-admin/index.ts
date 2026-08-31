import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, ...params } = await req.json();

    // Public actions (no auth needed)
    if (action === "getActiveLive") {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*")
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(JSON.stringify({ success: true, session: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "trackAnalytics") {
      const { session_id, visitor_id, watch_percentage, device_type, user_agent } = params;

      // Upsert analytics
      const { data: existing } = await supabase
        .from("live_analytics")
        .select("id, watch_percentage")
        .eq("session_id", session_id)
        .eq("visitor_id", visitor_id)
        .maybeSingle();

      if (existing) {
        const newPercentage = Math.max(existing.watch_percentage, watch_percentage);
        await supabase
          .from("live_analytics")
          .update({ watch_percentage: newPercentage, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("live_analytics").insert({
          session_id,
          visitor_id,
          watch_percentage,
          device_type,
          user_agent,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin actions - require auth
    if (action === "login") {
      const { email, password } = params;
      const { data: settings } = await supabase
        .from("live_settings")
        .select("*")
        .limit(1)
        .single();

      if (!settings || settings.admin_email !== email || settings.admin_password !== password) {
        return new Response(JSON.stringify({ success: false, error: "Credenciais inválidas" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "createLive") {
      const { title, video_url, fake_viewers_min, fake_viewers_max, whatsapp_group_link, cta_title, cta_description, cta_button_text, cta_button_link } = params;

      // End any currently active live
      await supabase
        .from("live_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .in("status", ["active", "paused"]);

      const { data, error } = await supabase
        .from("live_sessions")
        .insert({
          title: title || "Fazendo 5k com a MRO",
          video_url,
          fake_viewers_min: fake_viewers_min || 14,
          fake_viewers_max: fake_viewers_max || 200,
          whatsapp_group_link,
          cta_title,
          cta_description,
          cta_button_text,
          cta_button_link,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, session: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "updateLive") {
      const { id, ...updates } = params;
      const { data, error } = await supabase
        .from("live_sessions")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, session: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "pauseLive") {
      const { id } = params;
      const { data, error } = await supabase
        .from("live_sessions")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      return new Response(JSON.stringify({ success: true, session: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resumeLive") {
      const { id } = params;
      const { data, error } = await supabase
        .from("live_sessions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      return new Response(JSON.stringify({ success: true, session: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "endLive") {
      const { id } = params;
      const { data, error } = await supabase
        .from("live_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      return new Response(JSON.stringify({ success: true, session: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "getAllSessions") {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({ success: true, sessions: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "getRealtimeViewers") {
      const { session_id } = params;
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      const { data } = await supabase
        .from("live_analytics")
        .select("visitor_id, device_type, watch_percentage, updated_at")
        .eq("session_id", session_id)
        .gte("updated_at", thirtySecondsAgo);

      const activeViewers = data?.length || 0;
      const mobileCount = data?.filter((d: any) => d.device_type === "mobile").length || 0;
      const desktopCount = activeViewers - mobileCount;

      return new Response(
        JSON.stringify({
          success: true,
          realtime: { active: activeViewers, mobile: mobileCount, desktop: desktopCount },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "getAnalytics") {
      const { session_id } = params;
      const { data, error } = await supabase
        .from("live_analytics")
        .select("*")
        .eq("session_id", session_id);

      const total = data?.length || 0;
      const watched100 = data?.filter((d: any) => d.watch_percentage >= 95).length || 0;
      const watched50 = data?.filter((d: any) => d.watch_percentage >= 50 && d.watch_percentage < 95).length || 0;
      const watchedLess50 = data?.filter((d: any) => d.watch_percentage < 50).length || 0;

      return new Response(
        JSON.stringify({
          success: true,
          analytics: { total, watched100, watched50, watchedLess50, viewers: data },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "updateSettings") {
      const { default_whatsapp_group } = params;
      const { data: existing } = await supabase.from("live_settings").select("id").limit(1).single();

      if (existing) {
        await supabase
          .from("live_settings")
          .update({ default_whatsapp_group, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "getSettings") {
      const { data } = await supabase.from("live_settings").select("*").limit(1).single();
      return new Response(JSON.stringify({ success: true, settings: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
