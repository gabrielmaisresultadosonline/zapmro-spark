import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [METODO-SEGUIDOR-ADMIN-DATA] ${step}`, details ? JSON.stringify(details) : "");
};

// Get JWT signing key
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

// Verify admin JWT token
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

// Send email via SMTP
async function sendAccessEmail(
  email: string,
  username: string,
  instagramLink: string | null
): Promise<boolean> {
  try {
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) {
      log("SMTP password not configured");
      return false;
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.hostinger.com",
        port: 465,
        tls: true,
        auth: {
          username: "suporte@maisresultadosonline.com.br",
          password: smtpPassword,
        },
      },
    });

    const instagramSection = instagramLink ? `
      <p style="color: #9ca3af; margin: 8px 0;">
        <strong style="color: #f59e0b;">Perfil do Instagram:</strong> <a href="${instagramLink}" style="color: #60a5fa;">${instagramLink}</a>
      </p>
    ` : '';

    await client.send({
      from: "MRO - Mais Resultados Online <suporte@maisresultadosonline.com.br>",
      to: email,
      subject: "🎉 Seu acesso ao Método de Correção MRO está pronto!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; padding: 40px; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #f59e0b; margin: 0;">🎉 Parabéns!</h1>
            <p style="color: #9ca3af; margin-top: 10px;">Seu acesso foi liberado com sucesso</p>
          </div>
          
          <div style="background-color: #1f2937; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
            <h2 style="color: #ffffff; margin-top: 0;">Seus dados de acesso:</h2>
            <p style="color: #9ca3af; margin: 8px 0;">
              <strong style="color: #f59e0b;">Usuário:</strong> ${username}
            </p>
            <p style="color: #9ca3af; margin: 8px 0;">
              <strong style="color: #f59e0b;">Senha:</strong> ${username}
            </p>
            ${instagramSection}
          </div>

          <div style="background-color: #064e3b; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #10b981; margin: 0; font-weight: bold;">
              🔧 Agora vamos corrigir o perfil do seu Instagram com os métodos da MRO e deixar tudo profissional!
            </p>
          </div>
          
          <div style="text-align: center;">
            <a href="https://maisresultadosonline.com.br/metodoseguidormembro" 
               style="display: inline-block; background-color: #f59e0b; color: #000000; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Acessar Área de Membros
            </a>
          </div>
          
          <p style="color: #6b7280; text-align: center; margin-top: 30px; font-size: 14px;">
            Guarde este email com seus dados de acesso.
          </p>
          
          <hr style="border-color: #333; margin: 30px 0;">
          <p style="color: #6b7280; text-align: center; font-size: 12px;">
            MRO - Mais Resultados Online<br>
            Este é um email automático, não responda.
          </p>
        </div>
      `,
    });

    await client.close();
    log("Email sent successfully", { to: email });
    return true;
  } catch (error) {
    log("Error sending email", error);
    return false;
  }
}

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

    // Verify admin token for all requests
    const authHeader = req.headers.get("Authorization");
    const tokenResult = await verifyAdminToken(authHeader);

    if (!tokenResult.valid) {
      log("Unauthorized request - invalid or missing token");
      return new Response(
        JSON.stringify({ error: "Unauthorized - valid admin token required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    log("Authenticated admin request", { adminId: tokenResult.adminId, email: tokenResult.email });

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { action, user_id, order_id } = body;

    // Get users
    if (action === "get-users") {
      const { data: users, error } = await supabase
        .from("metodo_seguidor_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Remove password from response for security
      const sanitizedUsers = users?.map(user => {
        const { password, ...rest } = user;
        return rest;
      });

      return new Response(
        JSON.stringify({ success: true, users: sanitizedUsers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get orders
    if (action === "get-orders") {
      const { data: orders, error } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, orders }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Activate user
    if (action === "activate-user") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "User ID required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Get user
      const { data: user, error: userError } = await supabase
        .from("metodo_seguidor_users")
        .select("*")
        .eq("id", user_id)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      // Update user status
      await supabase
        .from("metodo_seguidor_users")
        .update({
          subscription_status: "active",
          subscription_start: new Date().toISOString()
        })
        .eq("id", user_id);

      // Update order status if exists
      const { data: order } = await supabase
        .from("metodo_seguidor_orders")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      if (order) {
        await supabase
          .from("metodo_seguidor_orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString()
          })
          .eq("id", order.id);
      }

      // Send email if not sent
      if (!user.email_sent) {
        const emailSent = await sendAccessEmail(user.email, user.username, user.instagram_username);
        if (emailSent) {
          await supabase
            .from("metodo_seguidor_users")
            .update({ email_sent: true, email_sent_at: new Date().toISOString() })
            .eq("id", user_id);
        }
      }

      log("User activated", { user_id, by_admin: tokenResult.email });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resend access email
    if (action === "resend-email") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "User ID required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { data: user, error: userError } = await supabase
        .from("metodo_seguidor_users")
        .select("*")
        .eq("id", user_id)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      const emailSent = await sendAccessEmail(user.email, user.username, user.instagram_username);

      if (emailSent) {
        await supabase
          .from("metodo_seguidor_users")
          .update({ email_sent: true, email_sent_at: new Date().toISOString() })
          .eq("id", user_id);
      }

      log("Email resent", { user_id, success: emailSent, by_admin: tokenResult.email });

      return new Response(
        JSON.stringify({ success: emailSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete user
    if (action === "delete-user") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "User ID required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Delete associated orders first
      await supabase
        .from("metodo_seguidor_orders")
        .delete()
        .eq("user_id", user_id);

      // Delete user
      const { error } = await supabase
        .from("metodo_seguidor_users")
        .delete()
        .eq("id", user_id);

      if (error) throw error;

      log("User deleted", { user_id, by_admin: tokenResult.email });

      return new Response(
        JSON.stringify({ success: true }),
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
