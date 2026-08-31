// =============================================================================
//  exportar-tabela-vps
//  Exporta QUALQUER tabela do schema public em páginas, já no formato de
//  comandos SQL "INSERT ... ON CONFLICT DO NOTHING", para migrar tabelas
//  grandes (crm_contacts, crm_messages, ...) para o Postgres da VPS.
//
//  Protegido pela senha do admin central (mesmo padrão de crm-central-admin).
//  Uso:
//    POST { adminPassword, table, offset, limit, orderBy }
//    -> { rows: number, sql: string, done: boolean }
// =============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_PASSWORD = "Ga145523@";

/** Tabelas liberadas para exportação (evita uso indevido da função). */
const ALLOWED_TABLES = new Set<string>([
  "crm_contacts",
  "crm_messages",
  "crm_activities",
  "crm_flow_executions",
  "crm_scheduled_messages",
  "crm_webhook_delivery_logs",
  "crm_metrics",
  "crm_flow_steps",
  "crm_webhooks",
  "crm_google_tokens",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

/** Converte um valor JS para literal SQL do Postgres. */
function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";

  // Arrays: usa literal ARRAY[...] (seguro para text[]/uuid[]/jsonb[])
  if (Array.isArray(value)) {
    if (value.length === 0) return "'{}'";
    const allScalar = value.every((v) => typeof v === "string" || typeof v === "number");
    if (allScalar) {
      return `ARRAY[${value.map((v) => toSqlLiteral(String(v))).join(",")}]`;
    }
    return `${quote(JSON.stringify(value))}::jsonb`;
  }

  if (typeof value === "object") return `${quote(JSON.stringify(value))}::jsonb`;
  return quote(String(value));
}

/** Aspas simples escapadas, no formato E'' quando houver barras invertidas. */
function quote(text: string): string {
  const escaped = text.replace(/'/g, "''");
  if (escaped.includes("\\")) return `E'${escaped.replace(/\\/g, "\\\\")}'`;
  return `'${escaped}'`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const adminPassword = String((body as any).adminPassword ?? "");
    const table = String((body as any).table ?? "");
    const offset = Number((body as any).offset ?? 0);
    const limit = Math.min(Number((body as any).limit ?? 500), 2000);
    const orderBy = String((body as any).orderBy ?? "id");

    if (adminPassword !== ADMIN_PASSWORD) return json({ error: "não autorizado" }, 401);
    if (!ALLOWED_TABLES.has(table)) return json({ error: `tabela não liberada: ${table}` }, 400);
    if (!Number.isFinite(offset) || offset < 0) return json({ error: "offset inválido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .order(orderBy, { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return json({ error: error.message }, 500);

    const rows = data ?? [];
    const lines: string[] = [];
    for (const row of rows) {
      const cols = Object.keys(row);
      const values = cols.map((c) => toSqlLiteral((row as Record<string, unknown>)[c]));
      lines.push(
        `INSERT INTO public.${table} (${cols.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING;`,
      );
    }

    return json({
      table,
      offset,
      rows: rows.length,
      total: count ?? null,
      done: rows.length < limit,
      sql: lines.join("\n"),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
