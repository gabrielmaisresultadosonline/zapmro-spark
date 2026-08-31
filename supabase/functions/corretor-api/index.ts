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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, email, announcement_id, user_id, text_length, correction_type } = await req.json();

    // Action: verify_user - Verifica se usuário existe e está ativo
    if (action === "verify_user") {
      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: "E-mail é obrigatório" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { data: user, error } = await supabase
        .from("corretor_users")
        .select("*")
        .eq("email", email.toLowerCase())
        .single();

      if (error || !user) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Usuário não encontrado",
            needs_payment: true 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // Verificar se acesso expirou
      const isActive = user.status === "active" && user.days_remaining > 0;

      // Atualizar último acesso
      await supabase
        .from("corretor_users")
        .update({ last_access: new Date().toISOString() })
        .eq("id", user.id);

      // Buscar contagem de correções dos últimos 30 dias
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: correctionsLast30Days } = await supabase
        .from("corretor_corrections_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", thirtyDaysAgo.toISOString());

      return new Response(
        JSON.stringify({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            days_remaining: user.days_remaining,
            is_active: isActive,
            needs_payment: !isActive,
            corrections_count: user.corrections_count || 0,
            corrections_last_30_days: correctionsLast30Days || 0
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: get_api_key - Retorna a API key do OpenAI
    if (action === "get_api_key") {
      const { data: setting } = await supabase
        .from("corretor_settings")
        .select("setting_value")
        .eq("setting_key", "openai_api_key")
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          api_key: setting?.setting_value || ""
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: log_correction - Registra uma correção feita pelo usuário
    if (action === "log_correction") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id é obrigatório" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Inserir log de correção
      await supabase
        .from("corretor_corrections_log")
        .insert({
          user_id,
          text_length: text_length || 0,
          correction_type: correction_type || "text"
        });

      // Incrementar contador no usuário
      await supabase.rpc("increment_corretor_corrections", { p_user_id: user_id });

      // Buscar contagem atualizada
      const { data: user } = await supabase
        .from("corretor_users")
        .select("corrections_count")
        .eq("id", user_id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          corrections_count: user?.corrections_count || 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: get_user_stats - Retorna estatísticas do usuário
    if (action === "get_user_stats") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id é obrigatório" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Buscar usuário
      const { data: user } = await supabase
        .from("corretor_users")
        .select("*")
        .eq("id", user_id)
        .single();

      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: "Usuário não encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      // Correções últimos 30 dias
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: correctionsLast30Days } = await supabase
        .from("corretor_corrections_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .gte("created_at", thirtyDaysAgo.toISOString());

      // Correções hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: correctionsToday } = await supabase
        .from("corretor_corrections_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .gte("created_at", today.toISOString());

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            total_corrections: user.corrections_count || 0,
            corrections_last_30_days: correctionsLast30Days || 0,
            corrections_today: correctionsToday || 0,
            days_remaining: user.days_remaining,
            status: user.status
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: get_announcements - Retorna avisos ativos para o usuário
    if (action === "get_announcements") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id é obrigatório" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Buscar avisos ativos
      const { data: announcements } = await supabase
        .from("corretor_announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      // Buscar quais o usuário já viu
      const { data: views } = await supabase
        .from("corretor_announcement_views")
        .select("announcement_id")
        .eq("user_id", user_id);

      const viewedIds = new Set(views?.map(v => v.announcement_id) || []);

      // Filtrar apenas os não vistos
      const pendingAnnouncements = (announcements || []).filter(
        (a: any) => !viewedIds.has(a.id)
      );

      return new Response(
        JSON.stringify({
          success: true,
          announcements: pendingAnnouncements
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: mark_viewed - Marca aviso como visualizado
    if (action === "mark_viewed") {
      if (!announcement_id || !user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "announcement_id e user_id são obrigatórios" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      await supabase
        .from("corretor_announcement_views")
        .insert({
          announcement_id,
          user_id,
          viewed_at: new Date().toISOString()
        });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    console.error("Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
