import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [METODO-SEGUIDOR-AUTH] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { action, username, password, userId } = body;

    if (action === "login") {
      log("Login attempt", { username });

      // Fetch user by username only (not password) to support bcrypt
      const { data: user, error } = await supabase
        .from("metodo_seguidor_users")
        .select("*")
        .eq("username", username.trim().toLowerCase())
        .eq("subscription_status", "active")
        .maybeSingle();

      if (error || !user) {
        log("Login failed - user not found or not active", { username, error });
        return new Response(
          JSON.stringify({ success: false, error: "Credenciais inválidas ou acesso não ativo" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check password - support both bcrypt and plaintext (for migration)
      let passwordValid = false;
      const storedPassword = user.password;

      if (storedPassword.startsWith("$2")) {
        // Password is already hashed with bcrypt
        passwordValid = await bcrypt.compare(password.trim(), storedPassword);
      } else {
        // Legacy plaintext password - check and upgrade
        passwordValid = storedPassword === password.trim();
        
        if (passwordValid) {
          // Upgrade to bcrypt hash
          log("Upgrading user password to bcrypt", { userId: user.id });
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password.trim(), salt);
          
          await supabase
            .from("metodo_seguidor_users")
            .update({ password: hashedPassword })
            .eq("id", user.id);
        }
      }

      if (!passwordValid) {
        log("Login failed - invalid password", { username });
        return new Response(
          JSON.stringify({ success: false, error: "Credenciais inválidas ou acesso não ativo" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last access
      await supabase
        .from("metodo_seguidor_users")
        .update({ last_access: new Date().toISOString() })
        .eq("id", user.id);

      log("Login successful", { userId: user.id });

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            instagram_username: user.instagram_username
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      const { data: user, error } = await supabase
        .from("metodo_seguidor_users")
        .select("*")
        .eq("id", userId)
        .eq("subscription_status", "active")
        .maybeSingle();

      if (error || !user) {
        return new Response(
          JSON.stringify({ success: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            instagram_username: user.instagram_username
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: errorMessage });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
