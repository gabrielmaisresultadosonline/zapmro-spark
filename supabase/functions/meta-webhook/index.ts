import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * LEGADO / DESCONTINUADO.
 *
 * Esta função era single-tenant: usava um registro fixo de `crm_settings`
 * e buscava contatos/fluxos SEM filtrar por `user_id`. Isso misturava
 * contatos e conversas entre cadastros diferentes.
 *
 * Agora ela apenas: (1) responde à verificação da Meta e (2) repassa o
 * payload para `meta-whatsapp-crm`, que é multi-tenant (resolve o dono
 * pelo phone_number_id antes de gravar qualquer coisa).
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const envToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
    let valid = !!token && token === envToken;

    if (!valid && token) {
      // Aceita também o verify token de qualquer conta configurada.
      const { data } = await supabase
        .from("crm_settings")
        .select("id")
        .eq("webhook_verify_token", token)
        .limit(1);
      valid = !!data && data.length > 0;
    }

    if (mode === "subscribe" && valid) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    try {
      const raw = await req.text();
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      // Repasse para a função multi-tenant (isolamento por usuário garantido lá).
      await supabase.functions.invoke("meta-whatsapp-crm", {
        body: { action: "processWebhook", ...(body as Record<string, unknown>) },
      });

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("[meta-webhook][legacy] Falha ao repassar payload:", error);
      // Sempre 200 para a Meta não reenfileirar infinitamente.
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
