import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type LoginBody = {
  adminEmail?: unknown;
  adminPassword?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido" }, 405);
  }

  try {
    const body = (await req.json()) as LoginBody;
    const email = typeof body.adminEmail === "string"
      ? body.adminEmail.trim().toLowerCase()
      : "";
    const password = typeof body.adminPassword === "string"
      ? body.adminPassword
      : "";

    if (!email || !password || email.length > 254 || password.length > 128) {
      return json({ success: false, error: "Credenciais inválidas" }, 401);
    }

    const expectedEmail = (Deno.env.get("ADMIN_CENTRAL_EMAIL") || "mro@gmail.com")
      .trim()
      .toLowerCase();
    const expectedPassword = Deno.env.get("ADMIN_CENTRAL_PASSWORD") || "Ga145523@";

    if (email !== expectedEmail || password !== expectedPassword) {
      return json({ success: false, error: "Credenciais inválidas" }, 401);
    }

    return json({ success: true });
  } catch (error) {
    console.error("[crm-central-admin-login] Invalid request:", error);
    return json({ success: false, error: "Requisição inválida" }, 400);
  }
});