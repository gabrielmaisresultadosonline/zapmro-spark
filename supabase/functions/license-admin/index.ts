import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateLicenseKey(): string {
  const chars = "0123456789ABCDEF";
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    let part = "";
    for (let j = 0; j < 4; j++) {
      part += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(part);
  }
  return parts.join("-");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    // LOGIN
    if (action === "login") {
      const { email, password } = body;
      const { data: settings } = await supabase
        .from("license_settings")
        .select("*")
        .single();

      if (!settings || settings.admin_email !== email || settings.admin_password !== password) {
        return new Response(JSON.stringify({ error: "Credenciais inválidas" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE LICENSE
    if (action === "create") {
      const { email, password } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email e senha obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if email already has a license
      const { data: existing } = await supabase
        .from("license_keys")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Este email já possui uma licença" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let licenseKey = generateLicenseKey();
      // Ensure unique
      let attempts = 0;
      while (attempts < 10) {
        const { data: dup } = await supabase
          .from("license_keys")
          .select("id")
          .eq("license_key", licenseKey)
          .maybeSingle();
        if (!dup) break;
        licenseKey = generateLicenseKey();
        attempts++;
      }

      const { data, error } = await supabase
        .from("license_keys")
        .insert({ email, password, license_key: licenseKey })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ license: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LIST LICENSES
    if (action === "list") {
      const { data, error } = await supabase
        .from("license_keys")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ licenses: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TOGGLE LICENSE
    if (action === "toggle") {
      const { id, is_active } = body;
      const { error } = await supabase
        .from("license_keys")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE LICENSE
    if (action === "delete") {
      const { id } = body;
      const { error } = await supabase.from("license_keys").delete().eq("id", id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // VALIDATE LICENSE (for extension)
    if (action === "validate") {
      const { email, password, license_key } = body;

      const { data: license } = await supabase
        .from("license_keys")
        .select("*")
        .eq("email", email)
        .eq("password", password)
        .eq("license_key", license_key)
        .eq("is_active", true)
        .maybeSingle();

      if (!license) {
        return new Response(JSON.stringify({ valid: false, error: "Licença inválida ou desativada" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update last validated
      await supabase
        .from("license_keys")
        .update({ last_validated_at: new Date().toISOString() })
        .eq("id", license.id);

      return new Response(JSON.stringify({ valid: true, license }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
