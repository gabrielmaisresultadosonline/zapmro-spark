import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [METODO-SEGUIDOR-ADMIN-AUTH] ${step}`, details ? JSON.stringify(details) : "");
};

// Get or create JWT signing key
const getJwtKey = async () => {
  const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!jwtSecret) {
    throw new Error("JWT secret not configured");
  }
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

// Verify JWT token
const verifyAdminToken = async (authHeader: string | null): Promise<{ valid: boolean; adminId?: string; email?: string }> => {
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false };
  }

  try {
    const token = authHeader.substring(7);
    const key = await getJwtKey();
    const payload = await verify(token, key);
    
    if (!payload.admin_id || !payload.email) {
      return { valid: false };
    }

    return { 
      valid: true, 
      adminId: payload.admin_id as string, 
      email: payload.email as string 
    };
  } catch (error) {
    log("Token verification failed", { error: error instanceof Error ? error.message : String(error) });
    return { valid: false };
  }
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
    const { action, email, password } = body;

    // Token verification action
    if (action === "verify-token") {
      const authHeader = req.headers.get("Authorization");
      const tokenResult = await verifyAdminToken(authHeader);
      
      if (!tokenResult.valid) {
        return new Response(
          JSON.stringify({ success: false, error: "Token inválido ou expirado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, admin: { id: tokenResult.adminId, email: tokenResult.email } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Login action
    log("Admin login attempt", { email });

    // Fetch admin by email only (not password)
    const { data: admin, error } = await supabase
      .from("metodo_seguidor_admins")
      .select("*")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (error || !admin) {
      log("Admin login failed - not found", { email, error });
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check password - support both bcrypt and plaintext (for migration)
    let passwordValid = false;
    const storedPassword = admin.password;

    if (storedPassword.startsWith("$2")) {
      // Password is already hashed with bcrypt
      passwordValid = await bcrypt.compare(password.trim(), storedPassword);
    } else {
      // Legacy plaintext password - check and upgrade
      passwordValid = storedPassword === password.trim();
      
      if (passwordValid) {
        // Upgrade to bcrypt hash
        log("Upgrading admin password to bcrypt", { adminId: admin.id });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password.trim(), salt);
        
        await supabase
          .from("metodo_seguidor_admins")
          .update({ password: hashedPassword })
          .eq("id", admin.id);
      }
    }

    if (!passwordValid) {
      log("Admin login failed - invalid password", { email });
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate JWT token
    const key = await getJwtKey();
    const token = await create(
      { alg: "HS256", typ: "JWT" },
      {
        admin_id: admin.id,
        email: admin.email,
        name: admin.name,
        exp: getNumericDate(24 * 60 * 60), // 24 hours expiry
        iat: getNumericDate(0)
      },
      key
    );

    log("Admin login successful", { adminId: admin.id });

    return new Response(
      JSON.stringify({ 
        success: true, 
        token,
        admin: { id: admin.id, email: admin.email, name: admin.name } 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
