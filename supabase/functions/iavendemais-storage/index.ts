import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, settings } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const BUCKET = "user-data";
    const FILE_PATH = "iavendemais/settings.json";

    if (action === "load") {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(FILE_PATH);

      if (error || !data) {
        return new Response(
          JSON.stringify({ success: true, data: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const text = await data.text();
      const parsed = JSON.parse(text);

      return new Response(
        JSON.stringify({ success: true, data: parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save") {
      const jsonStr = JSON.stringify(settings);
      const blob = new Blob([jsonStr], { type: "application/json" });

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, blob, { upsert: true, contentType: "application/json" });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
