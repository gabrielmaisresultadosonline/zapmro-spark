import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://esm.sh/zod@3.25.76";
import { verifyAdminSessionToken } from "../_shared/admin-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-token",
};

const SESSION_ID = "renda_extra";
const DEFAULT_SETTINGS = {
  id: SESSION_ID,
  enabled: true,
  delay_minutes: 30,
  message_template: "Olá! Vi seu cadastro e queria te explicar melhor como funciona.",
};
const DEFAULT_SESSION = {
  id: SESSION_ID,
  status: "disconnected",
  request_qr: false,
  request_logout: false,
  qr_code: null,
  phone_number: null,
  last_heartbeat: null,
};

const AdminActionSchema = z.object({
  action: z.enum(["getStatus", "requestQr", "logout", "saveSettings", "retryMessage", "deleteMessage", "enqueueLead", "sendNow", "sendTest"]),
  adminToken: z.string().optional(),
  message_template: z.string().max(4000).optional(),
  delay_minutes: z.coerce.number().int().min(1).max(10080).optional(),
  enabled: z.boolean().optional(),
  message_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  lead_name: z.string().max(255).nullable().optional(),
  phone: z.string().max(40).optional(),
});

async function readBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function normalizePhone(raw: string | undefined) {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  // Strip Brazilian "9" insertion on 13-digit numbers (55 + DDD + 9 + 8 dígitos antigos)
  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    digits = `${digits.slice(0, 4)}${digits.slice(5)}`;
  }
  // Always prepend 55 for BR-style numbers without country code
  // 11 digits = DDD(2) + 9 + 8 dígitos  -> add 55
  // 10 digits = DDD(2) + 8 dígitos      -> add 55
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  // Now if it became 13 with the "9" insertion, strip it
  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    digits = `${digits.slice(0, 4)}${digits.slice(5)}`;
  }
  return digits;
}

async function ensureRecords(supabase: ReturnType<typeof createClient>) {
  const { data: session } = await supabase.from("wpp_bot_session").select("id").eq("id", SESSION_ID).maybeSingle();
  if (!session) {
    await supabase.from("wpp_bot_session").insert(DEFAULT_SESSION);
  }
  const { data: settings } = await supabase.from("wpp_bot_settings").select("id").eq("id", SESSION_ID).maybeSingle();
  if (!settings) {
    await supabase.from("wpp_bot_settings").insert(DEFAULT_SETTINGS);
  }
}

async function loadSessionSecret(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("renda_extra_v2_settings").select("admin_email, admin_password").limit(1).single();
  if (!data) return null;
  return `${data.admin_email}:${data.admin_password}`;
}

async function isAuthorizedAdmin(req: Request, body: Record<string, unknown>, secret: string | null) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = typeof body.adminToken === "string" ? body.adminToken : bearer;
  if (!token) return false;

  // 1. Try verify using the service role key (instagram-admin scope)
  const serviceSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceSecret) {
    // Robust check matching instagram-admin's own logic
    const [payloadPart, signaturePart] = token.split(".");
    if (payloadPart && signaturePart) {
      try {
        const payloadBytes = fromBase64Url(payloadPart);
        const signatureBytes = fromBase64Url(signaturePart);
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(serviceSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"],
        );
        const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
        if (valid) {
          const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
          if (payload?.scope === "instagram-admin" && payload?.exp > Date.now()) {
            return true;
          }
        }
      } catch (e) {
        console.error("[isAuthorizedAdmin] Service role auth error:", e.message);
      }
    }
  }

  // 2. Try verify using the local secret (renda_extra_v2_settings) for compatibility
  if (secret) {
    const verified = await verifyAdminSessionToken(token, secret, "renda-extra-v2-admin") || 
                     await verifyAdminSessionToken(token, secret, "rendaext-admin");
    if (verified) return true;
  }

  return false;
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const handler = async (req: Request): Promise<Response> => {
  const start = Date.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return json({ success: false, error: "Backend configuration is missing" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRole, { 
    auth: { persistSession: false },
    global: { headers: { "x-my-custom-header": "wpp-bot" } }
  });

  try {
    const body = await readBody(req) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const headerToken = req.headers.get("x-bot-token");
    const botToken = Deno.env.get("WPP_BOT_TOKEN");
    
    let isAuthorized = false;
    let adminAuthorized = false;

    // 1. Check Bot Token first (fastest)
    if (botToken && headerToken === botToken) {
      isAuthorized = true;
    }

    // 2. If not bot authorized, check Admin Token
    if (!isAuthorized) {
      const adminSecret = await loadSessionSecret(supabase);
      adminAuthorized = await isAuthorizedAdmin(req, body, adminSecret);
      isAuthorized = adminAuthorized;
    }

    if (["botHeartbeat", "botFetchPending", "botUpdateMessage", "botAckCommand"].includes(action)) {
      if (!isAuthorized) {
        console.error(`Unauthorized bot request: action=${action}, hasHeader=${!!headerToken}`);
        return json({ success: false, error: "Unauthorized bot request" }, 401);
      }

      if (action === "botHeartbeat") {
        const update: Record<string, unknown> = {
          last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Buscar o status atual para preservar dados importantes
        const { data: currentSession } = await supabase
          .from("wpp_bot_session")
          .select("status, request_logout, request_qr, phone_number")
          .eq("id", SESSION_ID)
          .single();

        if (typeof body.status === "string") {
          let newStatus = body.status;
          
          // Lógica para manter o status "estável" na interface durante reconexões
          if (body.status === "disconnected" && currentSession?.status === "connected" && !currentSession?.request_logout) {
            console.log(`[botHeartbeat] Bot reportou desconexão temporária. Mantendo status visual...`);
            newStatus = "connected"; 
          } else if (body.status === "disconnected" && !currentSession?.request_logout && currentSession?.request_qr) {
            newStatus = "connecting";
          }

          update.status = newStatus;
          
          if (newStatus === "connected") {
            update.request_qr = false;
            update.request_logout = false;
            update.qr_code = null;
          }
        }
        
        if (body.qr_code !== undefined) update.qr_code = body.qr_code;
        
        // Preservar o número de telefone se o bot enviar null mas já tivermos um
        if (body.phone_number) {
          update.phone_number = body.phone_number;
        } else if (currentSession?.phone_number) {
          // Mantém o último número conhecido para não sumir da interface
          update.phone_number = currentSession.phone_number;
        }
        
        await supabase.from("wpp_bot_session").update(update).eq("id", SESSION_ID);
        
        // Retornar comandos básicos para agilizar a resposta do bot
        return json({ 
          success: true, 
          commands: { 
            request_qr: currentSession?.request_qr, 
            request_logout: currentSession?.request_logout 
          } 
        }, 200, start);
      }

      if (action === "botFetchPending") {
        const { data: messages } = await supabase
          .from("wpp_bot_messages")
          .select("*")
          .eq("status", "pending")
          .lte("scheduled_for", new Date().toISOString())
          .gt("created_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString()) // Apenas criados nas últimas 6h
          .order("scheduled_for", { ascending: true })
          .limit(10);

        const { data: session } = await supabase
          .from("wpp_bot_session")
          .select("request_qr, request_logout")
          .eq("id", SESSION_ID)
          .single();

        return json({ success: true, messages: messages || [], commands: session || {} }, 200, start);
      }

      if (action === "botUpdateMessage") {
        const update: Record<string, unknown> = {
          status: body.status,
          error_message: body.error_message || null,
          updated_at: new Date().toISOString(),
        };
        if (body.status === "sent") update.sent_at = new Date().toISOString();
        await supabase.from("wpp_bot_messages").update(update).eq("id", body.message_id);
        return json({ success: true }, 200, start);
      }

      if (action === "botAckCommand") {
        const update: Record<string, unknown> = {};
        if (body.cleared === "qr") update.request_qr = false;
        if (body.cleared === "logout") {
          update.request_logout = false;
          update.status = "disconnected";
          update.qr_code = null;
          update.phone_number = null;
        }
        await supabase.from("wpp_bot_session").update(update).eq("id", SESSION_ID);
        return json({ success: true }, 200, start);
      }
    }

    const parsed = AdminActionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ success: false, error: "Dados inválidos" }, 400);
    }
    if (!adminAuthorized) {
      return json({ success: false, error: "Sessão expirada. Faça login novamente." }, 401);
    }

    if (parsed.data.action === "getStatus") {
      const [{ data: session }, { data: settings }, { data: messages }] = await Promise.all([
        supabase.from("wpp_bot_session").select("*").eq("id", SESSION_ID).maybeSingle(),
        supabase.from("wpp_bot_settings").select("*").eq("id", SESSION_ID).maybeSingle(),
        supabase.from("wpp_bot_messages")
          .select("*")
          .gt("created_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString()) // Apenas últimas 6h
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      return json({ success: true, session, settings, messages: messages || [] });
    }

    if (parsed.data.action === "requestQr") {
      await supabase.from("wpp_bot_session").update({
        request_qr: true,
        request_logout: false,
        status: "connecting",
        qr_code: null,
        updated_at: new Date().toISOString(),
      }).eq("id", SESSION_ID);
      return json({ success: true });
    }

    if (parsed.data.action === "logout") {
      await supabase.from("wpp_bot_session").update({ request_logout: true, updated_at: new Date().toISOString() }).eq("id", SESSION_ID);
      return json({ success: true });
    }

    if (parsed.data.action === "saveSettings") {
      await supabase.from("wpp_bot_settings").update({
        message_template: parsed.data.message_template ?? DEFAULT_SETTINGS.message_template,
        delay_minutes: parsed.data.delay_minutes ?? DEFAULT_SETTINGS.delay_minutes,
        enabled: parsed.data.enabled ?? true,
        updated_at: new Date().toISOString(),
      }).eq("id", SESSION_ID);
      return json({ success: true });
    }

    if (parsed.data.action === "enqueueLead") {
      const phone = normalizePhone(parsed.data.phone);
      if (!phone) return json({ success: true, skipped: true, reason: "invalid_phone" });

      const { data: settings } = await supabase.from("wpp_bot_settings").select("*").eq("id", SESSION_ID).maybeSingle();
      if (!settings?.enabled) return json({ success: true, skipped: true, reason: "disabled" });

      // Verificar duplicidade e conteúdo
      if (parsed.data.lead_id) {
        const { data: existing } = await supabase
          .from("wpp_bot_messages")
          .select("id, status, message")
          .eq("lead_id", parsed.data.lead_id)
          .gt("created_at", new Date(Date.now() - 3600 * 1000).toISOString()) 
          .maybeSingle();

        if (existing) {
          const newMessage = parsed.data.message_template || settings.message_template;
          
          if (existing.message === newMessage) {
            console.log(`[enqueueLead] Mensagem idêntica já está pendente para o lead ${parsed.data.lead_id}. Ignorando.`);
            return json({ success: true, duplicate: true, message_id: existing.id });
          }

          if (existing.status === "pending") {
            await supabase.from("wpp_bot_messages").delete().eq("id", existing.id);
            console.log(`[enqueueLead] Mensagem pendente anterior deletada para o lead ${parsed.data.lead_id} (conteúdo diferente).`);
          }
        }
      }

      await supabase.from("wpp_bot_messages").insert({
        lead_id: parsed.data.lead_id || null,
        lead_name: parsed.data.lead_name || null,
        phone,
        message: parsed.data.message_template || settings.message_template,
        scheduled_for: new Date(Date.now() + (settings.delay_minutes || 30) * 60_000).toISOString(),
        status: "pending",
      });
      return json({ success: true });
    }

    if (parsed.data.action === "retryMessage" && parsed.data.message_id) {
      await supabase.from("wpp_bot_messages").update({
        status: "pending",
        error_message: null,
        scheduled_for: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", parsed.data.message_id);
      return json({ success: true });
    }

    if (parsed.data.action === "deleteMessage" && parsed.data.message_id) {
      await supabase.from("wpp_bot_messages").delete().eq("id", parsed.data.message_id);
      return json({ success: true });
    }

    if (parsed.data.action === "sendNow" && parsed.data.message_id) {
      await supabase.from("wpp_bot_messages").update({
        status: "pending",
        error_message: null,
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", parsed.data.message_id);
      return json({ success: true });
    }

    if (parsed.data.action === "sendTest") {
      const phone = normalizePhone(parsed.data.phone);
      if (!phone) return json({ success: false, error: "Número inválido" }, 400);
      
      const { data: settings } = await supabase.from("wpp_bot_settings").select("*").eq("id", SESSION_ID).maybeSingle();
      
      // Verificar se já existe uma mensagem pendente ou enviada para este lead nas últimas 24h
      // para evitar duplicidade causada por retentativas de webhook ou loops de interface
      if (parsed.data.lead_id) {
        const { data: existing } = await supabase
          .from("wpp_bot_messages")
          .select("id, status, message")
          .eq("lead_id", parsed.data.lead_id)
          .gt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          const newMessage = parsed.data.message_template || settings?.message_template || "";
          
          // Se a mensagem existente for exatamente igual, ignoramos para evitar duplicidade (pedido do usuário)
          if (existing.message === newMessage) {
            console.log(`[sendTest] Mensagem idêntica já existe para o lead ${parsed.data.lead_id}. Ignorando duplicado.`);
            return json({ success: true, duplicate: true, message_id: existing.id });
          }
          
          // Se a mensagem existente for diferente (ex: era remarketing e agora é acesso), 
          // deletamos a anterior (pendente) para garantir que o cliente receba a mais atual e correta.
          if (existing.status === "pending") {
            await supabase.from("wpp_bot_messages").delete().eq("id", existing.id);
            console.log(`[sendTest] Mensagem pendente anterior deletada para o lead ${parsed.data.lead_id}.`);
          }
          console.log(`[sendTest] Enviando nova versão da mensagem para o lead ${parsed.data.lead_id}.`);
        }
      }

      // Buscar qualquer mensagem pendente para o futuro PRÓXIMO para determinar se a fila está ocupada
      // Consideramos a fila "livre" se não houver mensagens agendadas para os próximos 10 minutos
      const tenMinutesFromNow = new Date(Date.now() + 10 * 60_000).toISOString();
      const { data: lastNearPending } = await supabase
        .from("wpp_bot_messages")
        .select("scheduled_for")
        .eq("status", "pending")
        .gt("scheduled_for", new Date().toISOString())
        .lt("scheduled_for", tenMinutesFromNow)
        .order("scheduled_for", { ascending: false })
        .limit(1)
        .maybeSingle();

      let baseTime = Date.now();
      let isQueueEmpty = true;

      if (lastNearPending?.scheduled_for) {
        const lastScheduled = new Date(lastNearPending.scheduled_for).getTime();
        baseTime = lastScheduled;
        isQueueEmpty = false;
      }

      // 10s se vazio, 3-5min se ocupado
      const minDelay = isQueueEmpty ? 10 : 180;
      const maxDelay = isQueueEmpty ? 15 : 300;
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
      
      // Se a fila estava vazia, baseTime é agora + 10s. 
      // Se não estava, é o horário da última + 3-5min.
      const scheduledFor = new Date(baseTime + randomDelay).toISOString();

      await supabase.from("wpp_bot_messages").insert({
        lead_id: parsed.data.lead_id || null,
        lead_name: parsed.data.lead_name || "VENDA",
        phone,
        message: parsed.data.message_template || settings?.message_template || "Obrigado por fazer parte do nosso sistema!✅",
        scheduled_for: scheduledFor,
        status: "pending",
      });
      return json({ success: true, phone, scheduled_for: scheduledFor });
    }

    return json({ success: false, error: "Ação inválida" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("wpp-bot-admin error", message);
    return json({ success: false, error: "Falha ao processar a solicitação" }, 500);
  }
};

function json(data: unknown, status = 200, startTime?: number) {
  if (startTime) {
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      console.warn(`Slow response: ${duration}ms`);
    }
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(handler);
