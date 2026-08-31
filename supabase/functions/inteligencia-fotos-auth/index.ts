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

    const { action, email, password, name, phone } = await req.json();

    if (action === "login") {
      // User login
      const { data: user, error } = await supabase
        .from("inteligencia_fotos_users")
        .select("id, name, email")
        .eq("email", email.toLowerCase().trim())
        .eq("password", password)
        .single();

      if (error || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "E-mail ou senha incorretos" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last access
      await supabase
        .from("inteligencia_fotos_users")
        .update({ last_access: new Date().toISOString() })
        .eq("id", user.id);

      return new Response(
        JSON.stringify({ success: true, user }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "register") {
      if (!name || !email || !password) {
        return new Response(
          JSON.stringify({ success: false, error: "Nome, e-mail e senha são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if email exists
      const { data: existing } = await supabase
        .from("inteligencia_fotos_users")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ success: false, error: "E-mail já cadastrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create user
      const { data: newUser, error } = await supabase
        .from("inteligencia_fotos_users")
        .insert({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password,
          phone: phone || null,
        })
        .select("id, name, email")
        .single();

      if (error) {
        console.error("Error creating user:", error);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao criar conta" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, user: newUser }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "admin_login") {
      // Admin login
      const { data: admin, error } = await supabase
        .from("inteligencia_fotos_admins")
        .select("id, name, email")
        .eq("email", email.toLowerCase().trim())
        .eq("password", password)
        .single();

      if (error || !admin) {
        return new Response(
          JSON.stringify({ success: false, error: "Credenciais inválidas" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, admin }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auth error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
