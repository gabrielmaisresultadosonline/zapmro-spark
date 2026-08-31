import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const respond = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized && normalized.length <= 255 ? normalized : null;
};

const normalizePassword = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 255 ? normalized : null;
};

const normalizeToken = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const toBase64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === "string" ? textEncoder.encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const getSigningKey = async (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

const createSessionToken = async (secret: string, email: string) => {
  const payload = JSON.stringify({ scope: "whatsapp-admin", email, exp: Date.now() + SESSION_TTL_MS });
  const key = await getSigningKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload)));
  return `${toBase64Url(payload)}.${toBase64Url(signature)}`;
};

const verifySessionToken = async (secret: string, token: string, allowedScopes: string[]) => {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  try {
    const payloadBytes = fromBase64Url(payloadPart);
    const signatureBytes = fromBase64Url(signaturePart);
    const key = await getSigningKey(secret);
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);

    if (!valid) return null;

    const payload = JSON.parse(textDecoder.decode(payloadBytes));
    if (!allowedScopes.includes(payload?.scope) || typeof payload?.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }

    return payload as { email: string; exp: number; scope: string };
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "publicConfig";

    const { data: settings, error: settingsError } = await supabase
      .from("whatsapp_page_settings")
      .select("id, whatsapp_number, page_title, page_subtitle, button_text, whatsapp_message, admin_email, admin_password, session_secret")
      .limit(1)
      .single();

    if (settingsError || !settings) {
      console.error("[whatsapp-page] settings error", settingsError);
      return respond({ success: false, error: "Configuração não encontrada" }, 500);
    }

    if (action === "publicConfig") {
      const { data: options, error: optionsError } = await supabase
        .from("whatsapp_page_options")
        .select("id, label, message, icon_type, color, order_index")
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (optionsError) {
        console.error("[whatsapp-page] options error", optionsError);
        return respond({ success: false, error: "Erro ao carregar opções" }, 500);
      }

      return respond({
        success: true,
        config: {
          whatsapp_number: settings.whatsapp_number ?? "",
          page_title: settings.page_title ?? "Gabriel está disponível agora para te ajudar",
          page_subtitle: settings.page_subtitle ?? "Sobre o que gostaria de falar clique no botão abaixo.",
          button_text: settings.button_text ?? "FALAR NO WHATSAPP",
          whatsapp_message: settings.whatsapp_message ?? "Olá, vim pelo site, gostaria de saber sobre o sistema inovador!",
          options: options ?? [],
        },
      });
    }

    if (action === "login") {
      const email = normalizeEmail(body.email);
      const password = normalizePassword(body.password);

      if (!email || !password) {
        return respond({ success: false, error: "Email e senha são obrigatórios" });
      }

      const validEmail = normalizeEmail(settings.admin_email);
      const validPassword = normalizePassword(settings.admin_password);
      const sessionSecret = typeof settings.session_secret === "string" ? settings.session_secret.trim() : "";

      if (!validEmail || !validPassword || !sessionSecret) {
        return respond({ success: false, error: "Configuração de login incompleta" }, 500);
      }

      if (email !== validEmail || password !== validPassword) {
        return respond({ success: false, error: "Email ou senha incorretos" });
      }

      const token = await createSessionToken(sessionSecret, email);
      return respond({ success: true, token });
    }

    const sessionSecret = typeof settings.session_secret === "string" ? settings.session_secret.trim() : "";
    const token = normalizeToken(body.token);
    const session = token
      ? await verifySessionToken(sessionSecret, token, ["whatsapp-admin"]) ??
        await verifySessionToken(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", token, ["instagram-admin"])
      : null;

    if (!session) {
      return respond({ success: false, error: "Sessão expirada. Faça login novamente." }, 401);
    }

    if (action === "adminData") {
      const { data: options, error: optionsError } = await supabase
        .from("whatsapp_page_options")
        .select("id, label, message, icon_type, color, order_index, is_active")
        .order("order_index", { ascending: true });

      if (optionsError) {
        console.error("[whatsapp-page] adminData options error", optionsError);
        return respond({ success: false, error: "Erro ao carregar dados" }, 500);
      }

      return respond({
        success: true,
        settings: {
          id: settings.id,
          whatsapp_number: settings.whatsapp_number ?? "",
          page_title: settings.page_title ?? "",
          page_subtitle: settings.page_subtitle ?? "",
          button_text: settings.button_text ?? "",
          whatsapp_message: settings.whatsapp_message ?? "",
        },
        options: options ?? [],
      });
    }

    if (action === "saveSettings") {
      const whatsappNumber = typeof body.whatsapp_number === "string" ? body.whatsapp_number.trim() : "";
      const pageTitle = typeof body.page_title === "string" ? body.page_title.trim().slice(0, 255) : "";
      const pageSubtitle = typeof body.page_subtitle === "string" ? body.page_subtitle.trim().slice(0, 255) : "";
      const buttonText = typeof body.button_text === "string" ? body.button_text.trim().slice(0, 120) : "";
      const whatsappMessage = typeof body.whatsapp_message === "string" ? body.whatsapp_message.trim().slice(0, 1000) : "";

      if (!whatsappNumber) {
        return respond({ success: false, error: "Número do WhatsApp é obrigatório" });
      }

      const { error: updateError } = await supabase
        .from("whatsapp_page_settings")
        .update({
          whatsapp_number: whatsappNumber,
          page_title: pageTitle,
          page_subtitle: pageSubtitle,
          button_text: buttonText,
          whatsapp_message: whatsappMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id);

      if (updateError) {
        console.error("[whatsapp-page] saveSettings error", updateError);
        return respond({ success: false, error: "Erro ao salvar configurações" }, 500);
      }

      return respond({ success: true });
    }

    if (action === "saveOption") {
      const id = typeof body.id === "string" ? body.id : "";
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
      const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
      const iconType = typeof body.icon_type === "string" ? body.icon_type.trim().slice(0, 50) : "help";
      const color = typeof body.color === "string" ? body.color.trim().slice(0, 20) : "#25D366";
      const orderIndex = Number.isFinite(Number(body.order_index)) ? Number(body.order_index) : 0;
      const isActive = body.is_active !== false;

      if (!id || !label || !message) {
        return respond({ success: false, error: "Dados da opção inválidos" });
      }

      const { error: optionError } = await supabase
        .from("whatsapp_page_options")
        .update({
          label,
          message,
          icon_type: iconType,
          color,
          order_index: orderIndex,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (optionError) {
        console.error("[whatsapp-page] saveOption error", optionError);
        return respond({ success: false, error: "Erro ao salvar opção" }, 500);
      }

      return respond({ success: true });
    }

    if (action === "addOption") {
      const orderIndex = Number.isFinite(Number(body.order_index)) ? Number(body.order_index) : 0;
      const { data: option, error: insertError } = await supabase
        .from("whatsapp_page_options")
        .insert({
          label: "Nova opção",
          message: "Olá, vim pelo site!",
          icon_type: "help",
          color: "#25D366",
          order_index: orderIndex,
          is_active: true,
        })
        .select("id, label, message, icon_type, color, order_index, is_active")
        .single();

      if (insertError || !option) {
        console.error("[whatsapp-page] addOption error", insertError);
        return respond({ success: false, error: "Erro ao criar opção" }, 500);
      }

      return respond({ success: true, option });
    }

    if (action === "deleteOption") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) {
        return respond({ success: false, error: "Opção inválida" });
      }

      const { error: deleteError } = await supabase
        .from("whatsapp_page_options")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("[whatsapp-page] deleteOption error", deleteError);
        return respond({ success: false, error: "Erro ao excluir opção" }, 500);
      }

      return respond({ success: true });
    }

    return respond({ success: false, error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("[whatsapp-page] unexpected error", error);
    return respond({ success: false, error: "Erro interno" }, 500);
  }
});