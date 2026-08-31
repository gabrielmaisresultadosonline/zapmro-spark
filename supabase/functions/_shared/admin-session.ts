const encoder = new TextEncoder();

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function createAdminSessionToken(payload: { email: string; scope: string; exp: number }, secret: string) {
  const serialized = JSON.stringify(payload);
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(serialized));
  return `${toBase64Url(encoder.encode(serialized))}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(token: string | null | undefined, secret: string, expectedScope: string) {
  if (!token || !secret) {
    console.error("[admin-session] Missing token or secret");
    return null;
  }
  
  const parts = token.split(".");
  if (parts.length !== 2) {
    console.error("[admin-session] Invalid token format (parts length != 2)");
    return null;
  }

  try {
    const payloadBytes = fromBase64Url(parts[0]);
    const signatureBytes = fromBase64Url(parts[1]);
    const key = await importHmacKey(secret);
    const verified = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
    
    if (!verified) {
      console.error("[admin-session] HMAC verification failed");
      return null;
    }

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      email?: string;
      scope?: string;
      exp?: number;
    };

    if (!payload.email) {
      console.error("[admin-session] Missing email in payload");
      return null;
    }

    if (payload.scope !== expectedScope) {
      console.error(`[admin-session] Scope mismatch. Expected: ${expectedScope}, got: ${payload.scope}`);
      return null;
    }

    if (!payload.exp || payload.exp < Date.now()) {
      console.error("[admin-session] Token expired");
      return null;
    }

    return payload;
  } catch (error) {
    console.error("[admin-session] Error verifying token:", error);
    return null;
  }
}
