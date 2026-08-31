// =============================================================================
//  exportar-storage-vps
//  Lista buckets e objetos do Storage da nuvem para que a VPS possa baixar os
//  arquivos (os buckets são públicos, então o download é feito por URL pública).
//
//  POST { adminPassword, action: "buckets" }
//  POST { adminPassword, action: "objects", bucket, prefix?, limit?, offset? }
// =============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_PASSWORD = "Ga145523@";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const adminPassword = String((body as any).adminPassword ?? "");
    if (adminPassword !== ADMIN_PASSWORD) return json({ error: "não autorizado" }, 401);

    const action = String((body as any).action ?? "buckets");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    if (action === "buckets") {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) return json({ error: error.message }, 500);
      return json({ buckets: data ?? [] });
    }

    if (action === "objects") {
      const bucket = String((body as any).bucket ?? "");
      const prefix = String((body as any).prefix ?? "");
      const limit = Math.min(Number((body as any).limit ?? 1000), 1000);
      const offset = Number((body as any).offset ?? 0);
      if (!bucket) return json({ error: "bucket obrigatório" }, 400);

      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) return json({ error: error.message }, 500);

      const items = (data ?? []).map((it) => ({
        name: it.name,
        // pastas vêm sem id/metadata
        isFolder: it.id === null && !it.metadata,
        size: (it.metadata as any)?.size ?? null,
      }));

      return json({ bucket, prefix, offset, items, done: items.length < limit });
    }

    return json({ error: `ação inválida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
