import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // Get all templates (admin only)
    if (action === "get_all_templates") {
      const { data, error } = await supabase
        .from("inteligencia_fotos_templates")
        .select("*")
        .order("order_index");

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, templates: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all users (admin only)
    if (action === "get_all_users") {
      const { data, error } = await supabase
        .from("inteligencia_fotos_users")
        .select("id, name, email, phone, created_at, last_access")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, users: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create template
    if (action === "create_template") {
      const { template } = body;
      
      const { data, error } = await supabase
        .from("inteligencia_fotos_templates")
        .insert({
          image_url: template.image_url,
          prompt: template.prompt,
          title: template.title || null,
          description: template.description || null,
          category: template.category || null,
          is_active: template.is_active !== false,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, template: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update template
    if (action === "update_template") {
      const { templateId, template } = body;
      
      const { data, error } = await supabase
        .from("inteligencia_fotos_templates")
        .update({
          image_url: template.image_url,
          prompt: template.prompt,
          title: template.title || null,
          description: template.description || null,
          category: template.category || null,
          is_active: template.is_active,
        })
        .eq("id", templateId)
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, template: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete template
    if (action === "delete_template") {
      const { templateId } = body;
      
      const { error } = await supabase
        .from("inteligencia_fotos_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user generations
    if (action === "get_generations") {
      const { userId } = body;
      
      const { data, error } = await supabase
        .from("inteligencia_fotos_generations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, generations: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save generation (mark as saved)
    if (action === "save_generation") {
      const { generationId } = body;
      
      const { error } = await supabase
        .from("inteligencia_fotos_generations")
        .update({ saved: true })
        .eq("id", generationId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete generation
    if (action === "delete_generation") {
      const { generationId } = body;
      
      const { error } = await supabase
        .from("inteligencia_fotos_generations")
        .delete()
        .eq("id", generationId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get settings
    if (action === "get_settings") {
      const { data, error } = await supabase
        .from("inteligencia_fotos_settings")
        .select("*");

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, settings: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save setting
    if (action === "save_setting") {
      const { settingKey, settingValue } = body;
      
      // Check if setting exists
      const { data: existing } = await supabase
        .from("inteligencia_fotos_settings")
        .select("id")
        .eq("setting_key", settingKey)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("inteligencia_fotos_settings")
          .update({ 
            setting_value: settingValue,
            updated_at: new Date().toISOString()
          })
          .eq("setting_key", settingKey);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("inteligencia_fotos_settings")
          .insert({
            setting_key: settingKey,
            setting_value: settingValue,
          });

        if (error) throw error;
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Manage error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
