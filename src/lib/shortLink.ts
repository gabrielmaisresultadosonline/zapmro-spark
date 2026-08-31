import { supabase } from "@/integrations/supabase/client";

/**
 * Encurtador próprio: transforma qualquer URL (inclusive wa.me, que a Meta
 * rejeita em botões) num link do domínio do site — ex.: https://zapmro.com.br/l/ab12cd
 */

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

const generateCode = (size = 6) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
};

export const SHORT_LINK_PREFIX = "/l/";

export const isShortLink = (url: string) => {
  try {
    return new URL(url).pathname.startsWith(SHORT_LINK_PREFIX);
  } catch {
    return false;
  }
};

export const shortLinkBaseUrl = () => {
  if (typeof window === "undefined") return "";
  const { origin } = window.location;
  // Em preview/localhost não existe domínio público válido para a Meta.
  if (/localhost|127\.0\.0\.1|lovable\.app/i.test(origin)) return "https://zapmro.com.br";
  return origin;
};

export interface CreateShortLinkResult {
  shortUrl: string;
  code: string;
}

export const createShortLink = async (targetUrl: string): Promise<CreateShortLinkResult> => {
  const target = String(targetUrl || "").trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new Error("Informe uma URL completa começando com http:// ou https://");
  }

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    userId = null;
  }

  // Colisão de código é improvável, mas tratada com novas tentativas.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await (supabase as any)
      .from("short_links")
      .insert({ code, target_url: target, user_id: userId });

    if (!error) {
      return { code, shortUrl: `${shortLinkBaseUrl()}${SHORT_LINK_PREFIX}${code}` };
    }

    const isDuplicate = String(error.code) === "23505" || /duplicate key/i.test(error.message || "");
    if (!isDuplicate) {
      throw new Error(error.message || "Não foi possível criar o link encurtado.");
    }
  }

  throw new Error("Não foi possível gerar um código único. Tente novamente.");
};

export const resolveShortLink = async (code: string): Promise<string | null> => {
  const clean = String(code || "").trim();
  if (!clean) return null;

  const { data, error } = await (supabase as any)
    .from("short_links")
    .select("id, target_url, clicks")
    .eq("code", clean)
    .maybeSingle();

  if (error || !data?.target_url) return null;

  // Contagem de cliques é best-effort: nunca bloqueia o redirecionamento.
  void (supabase as any)
    .from("short_links")
    .update({ clicks: (data.clicks ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", data.id);

  return data.target_url as string;
};
