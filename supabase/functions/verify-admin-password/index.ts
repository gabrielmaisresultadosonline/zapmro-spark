import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type VerifyAdminPasswordResponse = {
  success: boolean;
  error?: string;
};

const respond = (payload: VerifyAdminPasswordResponse) =>
  new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    status: 200,
  });

const normalizePassword = (value: unknown) => {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized || normalized.length > 100) return null;

  return normalized;
};

const extractPassword = (req: Request, rawBody: string) => {
  const urlPassword = normalizePassword(new URL(req.url).searchParams.get("password"));
  if (urlPassword) return urlPassword;

  if (!rawBody.trim()) return null;

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return normalizePassword(new URLSearchParams(rawBody).get("password"));
  }

  try {
    const parsed = JSON.parse(rawBody);

    if (typeof parsed === "string") {
      return normalizePassword(parsed);
    }

    return normalizePassword(parsed?.password);
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const password = extractPassword(req, rawBody);

    if (!password) {
      return respond({ success: false, error: "Invalid input" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabase
      .from("license_settings")
      .select("admin_password")
      .limit(1)
      .single();

    if (error || !data) {
      return respond({ success: false, error: "Config not found" });
    }

    const isValid = password === String(data.admin_password).trim();

    return respond({ success: isValid });
  } catch (error) {
    console.error("Error:", error);
    return respond({ success: false, error: "Internal error" });
  }
});
