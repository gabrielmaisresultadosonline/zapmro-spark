/**
 * Shared webhook security utilities for verifying InfiniPay webhook signatures
 */

/**
 * Timing-safe comparison to prevent timing attacks on signature verification
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Compute HMAC-SHA256 signature for webhook payload
 */
async function computeHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  
  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify InfiniPay webhook signature
 * Returns true if signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  rawPayload: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) {
    return false;
  }
  
  try {
    const expectedSignature = await computeHmacSignature(rawPayload, secret);
    return timingSafeEqual(signatureHeader, expectedSignature);
  } catch (error) {
    console.error("[WEBHOOK-SECURITY] Error verifying signature:", error);
    return false;
  }
}

/**
 * Extract signature from request headers
 * Supports multiple header formats that payment providers commonly use
 */
export function extractSignatureFromHeaders(headers: Headers): string | null {
  // Try various signature header names
  const headerNames = [
    "x-infinitepay-signature",
    "x-webhook-signature", 
    "signature",
    "x-signature",
    "x-hub-signature-256"
  ];
  
  for (const name of headerNames) {
    const value = headers.get(name);
    if (value) {
      // Handle formats like "sha256=xxx" by extracting just the signature
      if (value.startsWith("sha256=")) {
        return value.substring(7);
      }
      return value;
    }
  }
  
  return null;
}

/**
 * Create standard webhook verification middleware
 * Returns { verified: true, body: parsed } if valid
 * Returns { verified: false, response: Response } if invalid
 */
export async function verifyInfinitePayWebhook(
  req: Request,
  corsHeaders: Record<string, string>,
  functionName: string
): Promise<
  | { verified: true; body: Record<string, unknown>; rawBody: string }
  | { verified: false; response: Response }
> {
  const webhookSecret = Deno.env.get("INFINITEPAY_WEBHOOK_SECRET");
  
  // Get raw body for signature verification
  const rawBody = await req.text();
  
  // If no secret is configured, log a warning but allow the request (for backwards compatibility)
  // This allows the system to work while the user obtains and configures the secret
  if (!webhookSecret) {
    console.warn(`[${functionName}] INFINITEPAY_WEBHOOK_SECRET not configured - webhook signature verification DISABLED`);
    console.warn(`[${functionName}] This is a SECURITY RISK - configure the secret to enable verification`);
    
    try {
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      return { verified: true, body, rawBody };
    } catch (_error) {
      return {
        verified: false,
        response: new Response(
          JSON.stringify({ error: "Invalid JSON payload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      };
    }
  }
  
  // Extract signature from headers
  const signature = extractSignatureFromHeaders(req.headers);
  
  if (!signature) {
    console.error(`[${functionName}] Missing webhook signature header`);
    console.error(`[${functionName}] Request rejected - IP: ${req.headers.get("x-forwarded-for")}`);
    
    return {
      verified: false,
      response: new Response(
        JSON.stringify({ error: "Missing webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    };
  }
  
  // Verify signature
  const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
  
  if (!isValid) {
    console.error(`[${functionName}] Invalid webhook signature`);
    console.error(`[${functionName}] Request rejected - IP: ${req.headers.get("x-forwarded-for")}`);
    
    return {
      verified: false,
      response: new Response(
        JSON.stringify({ error: "Invalid webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    };
  }
  
  // Signature verified - parse and return body
  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    console.log(`[${functionName}] Webhook signature verified successfully`);
    return { verified: true, body, rawBody };
  } catch (_error) {
    return {
      verified: false,
      response: new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    };
  }
}
