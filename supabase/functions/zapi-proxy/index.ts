import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const isGroupId = (value: string): boolean => {
  return value.includes("@g.us") || value.includes("-");
};

const normalizePhone = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  // Preserve group IDs (contain @g.us or dashes like 120363xxxxx@g.us)
  if (isGroupId(trimmed)) {
    return trimmed.split("@")[0] ?? "";
  }
  const base = trimmed.split("@")[0] ?? "";
  const digits = base.replace(/\D/g, "");
  return digits || base;
};

const normalizeBrazilianPhone = (phone: string): string => {
  // Don't normalize group IDs
  if (phone.includes("-")) return phone;
  const d = phone.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.startsWith("9") && rest.length === 9) {
      return `55${ddd}${rest.slice(1)}`;
    }
  }
  return d;
};

const isRealPhone = (phone: string): boolean => {
  // Group IDs are valid (contain dashes like 120363044828-xxx)
  if (phone.includes("-")) return true;
  const d = phone.replace(/\D/g, "");
  // Real phone numbers: 10-13 digits. Z-API lids are typically 15+ digits
  return d.length >= 10 && d.length <= 13;
};

const safeJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const data = body?.data ?? {};

    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For save-settings action, we don't need existing settings
    if (action === "save-settings") {
      const instance_id = typeof data.instance_id === "string" ? data.instance_id.trim() : "";
      const token = typeof data.token === "string" ? data.token.trim() : "";
      const client_token = typeof data.client_token === "string" ? data.client_token.trim() : null;

      if (!instance_id || !token) {
        return new Response(JSON.stringify({ error: "Instance ID e Token são obrigatórios." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase
        .from("zapi_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from("zapi_settings")
          .update({ instance_id, token, client_token, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("zapi_settings")
          .insert({ instance_id, token, client_token });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("zapi_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (action === "get-settings") {
      return new Response(JSON.stringify({ settings: settings || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cleanup-contacts") {
      const { data: allContacts } = await supabase
        .from("zapi_contacts")
        .select("id, phone, name");
      
      const removed: string[] = [];
      const merged: string[] = [];
      
      if (allContacts) {
        for (const c of allContacts) {
          if (!isRealPhone(c.phone)) {
            const { error } = await supabase.from("zapi_contacts").delete().eq("id", c.id);
            if (!error) removed.push(c.phone);
            else console.error("Delete error:", c.phone, error);
          } else {
            const normalized = normalizeBrazilianPhone(c.phone);
            if (normalized !== c.phone) {
              const { data: existing } = await supabase
                .from("zapi_contacts")
                .select("id")
                .eq("phone", normalized)
                .maybeSingle();
              if (existing) {
                await supabase.from("zapi_messages").update({ phone: normalized }).eq("phone", c.phone);
                const { error } = await supabase.from("zapi_contacts").delete().eq("id", c.id);
                if (!error) merged.push(`${c.phone} → ${normalized}`);
              } else {
                await supabase.from("zapi_contacts").update({ phone: normalized }).eq("id", c.id);
                merged.push(`${c.phone} → ${normalized}`);
              }
            }
          }
        }
      }
      
      const { data: remaining } = await supabase
        .from("zapi_contacts")
        .select("phone, name")
        .order("last_message_at", { ascending: false });
      
      return new Response(JSON.stringify({ removed, merged, remaining: remaining ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-db-contacts") {
      const { data: contacts, error } = await supabase
        .from("zapi_contacts")
        .select("*")
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ contacts: contacts ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-db-messages") {
      const rawPhone = normalizePhone(data.phone);
      const phone = normalizeBrazilianPhone(rawPhone);
      if (!phone) {
        return new Response(JSON.stringify({ messages: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phonesToQuery = [phone];
      if (rawPhone && rawPhone !== phone) phonesToQuery.push(rawPhone);

      const { data: messages, error } = await supabase
        .from("zapi_messages")
        .select("*")
        .in("phone", phonesToQuery)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({ messages: messages ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "mark-read") {
      const phone = normalizeBrazilianPhone(normalizePhone(data.phone));
      if (phone) {
        await supabase
          .from("zapi_contacts")
          .update({ unread_count: 0, updated_at: new Date().toISOString() })
          .eq("phone", phone);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!settings?.instance_id || !settings?.token) {
      return new Response(JSON.stringify({ error: "Z-API não configurado. Configure Instance ID e Token." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = `https://api.z-api.io/instances/${settings.instance_id}/token/${settings.token}`;
    const zapiHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (settings.client_token) {
      zapiHeaders["Client-Token"] = settings.client_token;
    }

    const callZapi = async (
      path: string,
      init?: RequestInit,
    ) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...zapiHeaders,
          ...(init?.headers || {}),
        },
      });
      const payload = await safeJson(response);
      return { response, payload };
    };

    const executeFlowSteps = async (
      executionId: string,
      execPhone: string,
      flowSteps: any[],
      startIndex = 0,
    ) => {
      let stepsExecuted = 0;

      for (let index = startIndex; index < flowSteps.length; index++) {
        const step = flowSteps[index];
        const currentStep = Number(step?.step_order ?? index);

        if (step.wait_for_reply) {
          await supabase
            .from("zapi_flow_executions")
            .update({
              status: "paused",
              current_step: currentStep,
              paused_at: new Date().toISOString(),
              last_step_at: new Date().toISOString(),
            })
            .eq("id", executionId);

          return { stepsExecuted, status: "paused" as const, current_step: currentStep };
        }

        if (step.delay_seconds > 0) {
          await new Promise((r) => setTimeout(r, step.delay_seconds * 1000));
        }

        if (step.simulate_typing && step.typing_duration_ms > 0) {
          try {
            await callZapi("/send-typing", {
              method: "POST",
              body: JSON.stringify({ phone: execPhone }),
            });
            await new Promise((r) => setTimeout(r, Math.min(step.typing_duration_ms, 5000)));
            await callZapi("/send-typing-stop", {
              method: "POST",
              body: JSON.stringify({ phone: execPhone }),
            });
          } catch {
            // Ignore typing simulation errors; continue sending message
          }
        }

        switch (step.step_type) {
          case "text":
            if (step.content) {
              const textResponse = await callZapi("/send-text", {
                method: "POST",
                body: JSON.stringify({ phone: execPhone, message: step.content }),
              });

              if (!textResponse.response.ok) {
                console.error(`[Flow] Error sending text: ${textResponse.response.status}`, textResponse.payload);
                throw new Error(`Falha ao enviar texto (${textResponse.response.status})`);
              }

              await supabase.from("zapi_messages").insert({
                phone: execPhone,
                direction: "outgoing",
                message_type: "text",
                content: step.content,
                status: "sent",
                timestamp: Date.now(),
              });
            }
            break;

          case "image":
            if (step.media_url) {
              await callZapi("/send-image", {
                method: "POST",
                body: JSON.stringify({ phone: execPhone, image: step.media_url, caption: step.content || "" }),
              });
              await supabase.from("zapi_messages").insert({
                phone: execPhone,
                direction: "outgoing",
                message_type: "image",
                content: step.content || "",
                media_url: step.media_url,
                status: "sent",
                timestamp: Date.now(),
              });
            }
            break;

          case "audio":
            if (step.media_url) {
              const audioResponse = await callZapi("/send-audio", {
                method: "POST",
                body: JSON.stringify({ phone: execPhone, audio: step.media_url, waveform: true }),
              });
              
              if (!audioResponse.response.ok) {
                console.error(`[Flow] Error sending audio: ${audioResponse.response.status}`, audioResponse.payload);
                throw new Error(`Falha ao enviar áudio (${audioResponse.response.status})`);
              }

              await supabase.from("zapi_messages").insert({
                phone: execPhone,
                direction: "outgoing",
                message_type: "audio",
                media_url: step.media_url,
                status: "sent",
                timestamp: Date.now(),
              });
            }
            break;

          case "video":
            if (step.media_url) {
              await callZapi("/send-video", {
                method: "POST",
                body: JSON.stringify({ phone: execPhone, video: step.media_url, caption: step.content || "" }),
              });
              await supabase.from("zapi_messages").insert({
                phone: execPhone,
                direction: "outgoing",
                message_type: "video",
                content: step.content || "",
                media_url: step.media_url,
                status: "sent",
                timestamp: Date.now(),
              });
            }
            break;

          case "buttons":
            if (step.content) {
              const buttonOptions: string[] = step.button_options || [];
              const buttons = buttonOptions.map((b: string, idx: number) => ({ id: String(idx + 1), label: b }));
              if (buttons.length > 0) {
                // Prefer send-option-list because it is more stable on WhatsApp mobile
                const optionListPayload = {
                  phone: execPhone,
                  message: step.content,
                  optionList: {
                    title: "Escolha uma opção",
                    buttonLabel: "Ver opções",
                    options: buttons.map((b) => ({
                      id: b.id,
                      title: (b.label || "").slice(0, 72),
                      description: "",
                    })),
                  },
                };

                const optionListSend = await callZapi("/send-option-list", {
                  method: "POST",
                  body: JSON.stringify(optionListPayload),
                });

                // Fallback to action buttons for accounts where option list is unavailable
                if (!optionListSend.response.ok) {
                  console.warn("[Flow] send-option-list failed, falling back to send-button-actions", {
                    status: optionListSend.response.status,
                    payload: optionListSend.payload,
                  });

                  const buttonActions = buttons.map((b) => ({
                    id: b.id,
                    type: "REPLY",
                    label: b.label,
                  }));

                  const actionButtonsSend = await callZapi("/send-button-actions", {
                    method: "POST",
                    body: JSON.stringify({
                      phone: execPhone,
                      message: step.content,
                      buttonActions,
                    }),
                  });

                  if (!actionButtonsSend.response.ok) {
                    throw new Error(`Falha ao enviar botões (${actionButtonsSend.response.status})`);
                  }
                }
              } else {
                await callZapi("/send-text", {
                  method: "POST",
                  body: JSON.stringify({ phone: execPhone, message: step.content }),
                });
              }

              await supabase.from("zapi_messages").insert({
                phone: execPhone,
                direction: "outgoing",
                message_type: "buttons",
                content: step.content,
                status: "sent",
                timestamp: Date.now(),
                metadata: buttons.length > 0 ? { buttons } : null,
              });

              // Auto-pause to wait for button response if it's a buttons step
              await supabase
                .from("zapi_flow_executions")
                .update({
                  status: "paused",
                  current_step: currentStep,
                  paused_at: new Date().toISOString(),
                  last_step_at: new Date().toISOString(),
                })
                .eq("id", executionId);

              return { stepsExecuted: stepsExecuted + 1, status: "paused" as const, current_step: currentStep };
            }
            break;
        }

        stepsExecuted++;

        await supabase
          .from("zapi_flow_executions")
          .update({
            current_step: currentStep,
            last_step_at: new Date().toISOString(),
          })
          .eq("id", executionId);
      }

      await supabase
        .from("zapi_flow_executions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          paused_at: null,
          last_step_at: new Date().toISOString(),
        })
        .eq("id", executionId);

      return { stepsExecuted, status: "completed" as const, current_step: flowSteps.length - 1 };
    };

    switch (action) {
      case "enable-sent-by-me": {
        const { payload: sentByMeResult } = await callZapi("/update-notify-sent-by-me", {
          method: "PUT",
          body: JSON.stringify({ notifySentByMe: true }),
        });
        return new Response(JSON.stringify({ success: true, result: sentByMeResult }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "sync-chats": {
        const { payload } = await callZapi("/chats");
        const chatList = Array.isArray(payload)
          ? payload
          : (payload?.chats || payload?.data || []);

        if (!Array.isArray(chatList)) {
          return new Response(JSON.stringify({ synced: 0, contacts: [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let synced = 0;
        const seenPhones = new Set<string>();

        for (const chat of chatList) {
          const rawId = chat?.phone || chat?.chatId || chat?.waId || chat?.id || "";
          const chatIsGroup = isGroupId(String(rawId));
          const rawPhone = normalizePhone(rawId);
          if (!rawPhone || !isRealPhone(rawPhone)) continue;
          const phone = normalizeBrazilianPhone(rawPhone);
          if (seenPhones.has(phone)) continue;
          seenPhones.add(phone);

          const lastMessageRaw = Number(chat?.lastMessageTimestamp ?? chat?.lastMessageTime ?? chat?.last_message_at ?? Date.now());
          const lastMessageAt = Number.isFinite(lastMessageRaw)
            ? new Date(lastMessageRaw > 1e12 ? lastMessageRaw : lastMessageRaw * 1000).toISOString()
            : new Date().toISOString();

          const unreadCount = Number(chat?.unreadMessages ?? chat?.messagesUnread ?? chat?.unread ?? 0) || 0;

          const { error } = await supabase
            .from("zapi_contacts")
            .upsert({
              phone,
              name: chat?.name || chat?.chatName || chat?.pushName || phone,
              profile_pic_url: chat?.profileThumbnail || chat?.imgUrl || chat?.profilePicUrl || null,
              last_message_at: lastMessageAt,
              unread_count: unreadCount,
              is_group: chatIsGroup,
              updated_at: new Date().toISOString(),
            }, { onConflict: "phone" });

          if (!error) synced += 1;
        }

        // Clean up invalid contacts (internal IDs / duplicates)
        const { data: allContacts } = await supabase
          .from("zapi_contacts")
          .select("id, phone");
        if (allContacts) {
          for (const c of allContacts) {
            if (!isRealPhone(c.phone)) {
              await supabase.from("zapi_contacts").delete().eq("id", c.id);
            } else {
              const normalized = normalizeBrazilianPhone(c.phone);
              if (normalized !== c.phone) {
                const { data: existing } = await supabase
                  .from("zapi_contacts")
                  .select("id")
                  .eq("phone", normalized)
                  .maybeSingle();
                if (existing) {
                  await supabase.from("zapi_messages").update({ phone: normalized }).eq("phone", c.phone);
                  await supabase.from("zapi_contacts").delete().eq("id", c.id);
                } else {
                  await supabase.from("zapi_contacts").update({ phone: normalized, updated_at: new Date().toISOString() }).eq("id", c.id);
                }
              }
            }
          }
        }

        const { data: contacts } = await supabase
          .from("zapi_contacts")
          .select("*")
          .order("last_message_at", { ascending: false });

        return new Response(JSON.stringify({ synced, contacts: contacts ?? [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-status": {
        const { payload: statusData } = await callZapi("/status");

        await supabase
          .from("zapi_settings")
          .update({
            is_connected: statusData?.connected === true,
            phone_number: statusData?.smartphoneConnected || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", settings.id);

        return new Response(JSON.stringify(statusData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-qrcode": {
        const { payload: qrData } = await callZapi("/qr-code");
        return new Response(JSON.stringify(qrData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-chats": {
        const { payload: chatsData } = await callZapi("/chats");
        return new Response(JSON.stringify(chatsData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-messages": {
        const rawMsgPhone = normalizePhone(data.phone);
        // Denormalize for Z-API: add 9 back for 12-digit Brazilian numbers
        let apiPhone = rawMsgPhone;
        const digits = rawMsgPhone.replace(/\D/g, "");
        if (digits.length === 12 && digits.startsWith("55")) {
          const ddd = digits.slice(2, 4);
          const subscriber = digits.slice(4);
          apiPhone = `55${ddd}9${subscriber}`;
        }
        if (!rawMsgPhone) {
          return new Response(JSON.stringify([]), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { payload: messagesData } = await callZapi(`/chat-messages/${apiPhone}`);
        return new Response(JSON.stringify(messagesData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "sync-messages": {
        const rawSyncPhone = normalizePhone(data.phone);
        const phone = normalizeBrazilianPhone(rawSyncPhone);
        if (!phone) {
          return new Response(JSON.stringify({ inserted: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Denormalize phone for Z-API call (add 9 back for Brazilian numbers)
        let syncApiPhone = phone;
        if (phone.length === 12 && phone.startsWith("55")) {
          const ddd = phone.slice(2, 4);
          const subscriber = phone.slice(4);
          syncApiPhone = `55${ddd}9${subscriber}`;
        }

        console.log(`[sync-messages] phone=${phone} apiPhone=${syncApiPhone}`);
        const { payload } = await callZapi(`/chat-messages/${syncApiPhone}`);
        let msgList = Array.isArray(payload) ? payload : (payload?.messages || payload?.data || []);
        console.log(`[sync-messages] got ${Array.isArray(msgList) ? msgList.length : 0} messages from Z-API`);
        const messages = msgList;

        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response(JSON.stringify({ inserted: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ids = messages
          .map((msg) => msg?.messageId || msg?.zaapId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);

        let existingIds = new Set<string>();
        if (ids.length > 0) {
          const { data: existing } = await supabase
            .from("zapi_messages")
            .select("message_id")
            .in("message_id", ids);

          existingIds = new Set((existing ?? []).map((row: { message_id: string | null }) => row.message_id).filter(Boolean) as string[]);
        }

        let inserted = 0;

        for (const msg of messages.slice(-100)) {
          const messageId = msg?.messageId || msg?.zaapId || null;
          if (messageId && existingIds.has(messageId)) continue;

          const direction = msg?.fromMe ? "outgoing" : "incoming";
          const messageType = msg?.image
            ? "image"
            : msg?.audio
            ? "audio"
            : msg?.document
            ? "document"
            : msg?.video
            ? "video"
            : msg?.buttonsResponseMessage || msg?.listResponseMessage
            ? "button_response"
            : msg?.buttonMessage
            ? "buttons"
            : "text";

          let content =
            msg?.text?.message ||
            msg?.text ||
            msg?.image?.caption ||
            msg?.video?.caption ||
            msg?.document?.fileName ||
            msg?.buttonsResponseMessage?.selectedDisplayText ||
            msg?.buttonsResponseMessage?.selectedButtonId ||
            msg?.listResponseMessage?.title ||
            msg?.listResponseMessage?.singleSelectReply?.title ||
            msg?.buttonMessage?.message ||
            msg?.buttonMessage?.contentText ||
            "";

          let metadata = null;
          if (msg?.buttonsResponseMessage) {
            const selectedText = msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId || "";
            metadata = {
              selectedButtonId: msg.buttonsResponseMessage.selectedButtonId,
              selectedButtonText: selectedText,
              selectedDisplayText: selectedText,
            };
          } else if (msg?.listResponseMessage) {
            const selectedRowId =
              msg.listResponseMessage.singleSelectReply?.selectedRowId ||
              msg.listResponseMessage.selectedRowId ||
              msg.listResponseMessage.listType?.toString() ||
              "";
            const selectedListText =
              msg.listResponseMessage.title ||
              msg.listResponseMessage.singleSelectReply?.title ||
              msg.listResponseMessage.singleSelectReply?.description ||
              selectedRowId;

            metadata = {
              selectedButtonId: selectedRowId,
              selectedButtonText: selectedListText,
              selectedDisplayText: selectedListText,
            };
          } else if (msg?.buttonMessage) {
            metadata = {
              buttons: (msg.buttonMessage.buttons || []).map((b: any) => ({
                id: b.buttonId || b.id || "",
                label: b.buttonText?.displayText || b.label || b.buttonId || "",
              })),
              title: msg.buttonMessage.title || null,
              footer: msg.buttonMessage.footerText || null,
            };
          }

          const mediaUrl =
            msg?.image?.imageUrl ||
            msg?.image?.url ||
            msg?.audio?.audioUrl ||
            msg?.audio?.url ||
            msg?.video?.videoUrl ||
            msg?.video?.url ||
            msg?.document?.documentUrl ||
            msg?.document?.url ||
            null;

          const messagePhone = normalizeBrazilianPhone(normalizePhone(msg?.phone || phone));

          const { error } = await supabase.from("zapi_messages").insert({
            message_id: messageId,
            phone: messagePhone,
            contact_name: msg?.senderName || msg?.chatName || null,
            direction,
            message_type: messageType,
            content,
            media_url: mediaUrl,
            metadata,
            status: direction === "incoming" ? "received" : "sent",
            is_read: direction === "outgoing",
            timestamp: Number(msg?.momment || msg?.timestamp || Date.now()),
          });

          if (!error) inserted += 1;
        }

        if (inserted > 0) {
          await supabase
            .from("zapi_contacts")
            .upsert({
              phone,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "phone" });
        }

        return new Response(JSON.stringify({ inserted }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send-text": {
        const phone = normalizeBrazilianPhone(normalizePhone(data.phone));
        const message = typeof data.message === "string" ? data.message : "";

        if (!phone || !message.trim()) {
          return new Response(JSON.stringify({ error: "Telefone e mensagem são obrigatórios." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { payload: sendResult } = await callZapi("/send-text", {
          method: "POST",
          body: JSON.stringify({ phone, message }),
        });

        await supabase.from("zapi_messages").insert({
          message_id: sendResult?.messageId || null,
          phone,
          direction: "outgoing",
          message_type: "text",
          content: message,
          status: "sent",
          timestamp: Date.now(),
        });

        await supabase.from("zapi_contacts").upsert({
          phone,
          name: phone,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "phone" });

        return new Response(JSON.stringify(sendResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send-image": {
        const phone = normalizeBrazilianPhone(normalizePhone(data.phone));
        const image = typeof data.image === "string" ? data.image : "";
        const caption = typeof data.caption === "string" ? data.caption : "";

        const { payload: imgResult } = await callZapi("/send-image", {
          method: "POST",
          body: JSON.stringify({ phone, image, caption }),
        });

        await supabase.from("zapi_messages").insert({
          message_id: imgResult?.messageId || null,
          phone,
          direction: "outgoing",
          message_type: "image",
          content: caption || "",
          media_url: image,
          status: "sent",
          timestamp: Date.now(),
        });

        return new Response(JSON.stringify(imgResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send-audio": {
        const phone = normalizeBrazilianPhone(normalizePhone(data.phone));
        const audio = typeof data.audio === "string" ? data.audio : "";

        const { payload: audioResult } = await callZapi("/send-audio", {
          method: "POST",
          body: JSON.stringify({ phone, audio, waveform: true }),
        });

        await supabase.from("zapi_messages").insert({
          message_id: audioResult?.messageId || null,
          phone,
          direction: "outgoing",
          message_type: "audio",
          media_url: audio,
          status: "sent",
          timestamp: Date.now(),
        });

        return new Response(JSON.stringify(audioResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send-video": {
        const phone = normalizeBrazilianPhone(normalizePhone(data.phone));
        const video = typeof data.video === "string" ? data.video : "";
        const caption = typeof data.caption === "string" ? data.caption : "";

        const { payload: vidResult } = await callZapi("/send-video", {
          method: "POST",
          body: JSON.stringify({ phone, video, caption }),
        });

        await supabase.from("zapi_messages").insert({
          message_id: vidResult?.messageId || null,
          phone,
          direction: "outgoing",
          message_type: "video",
          content: caption || "",
          media_url: video,
          status: "sent",
          timestamp: Date.now(),
        });

        return new Response(JSON.stringify(vidResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send-document": {
        const phone = normalizeBrazilianPhone(normalizePhone(data.phone));
        const docUrl = typeof data.document === "string" ? data.document : "";
        const fileName = typeof data.fileName === "string" ? data.fileName : "";

        const { payload: docResult } = await callZapi("/send-document/pdf", {
          method: "POST",
          body: JSON.stringify({ phone, document: docUrl, fileName }),
        });

        await supabase.from("zapi_messages").insert({
          message_id: docResult?.messageId || null,
          phone,
          direction: "outgoing",
          message_type: "document",
          content: fileName || "",
          media_url: docUrl,
          status: "sent",
          timestamp: Date.now(),
        });

        return new Response(JSON.stringify(docResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-profile-picture": {
        const picPhone = normalizeBrazilianPhone(normalizePhone(data.phone));
        const { payload: picData } = await callZapi(`/profile-picture/${picPhone}`);
        return new Response(JSON.stringify(picData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-contacts": {
        const { payload: contactsData } = await callZapi("/contacts");
        return new Response(JSON.stringify(contactsData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect": {
        const { payload: disconnectData } = await callZapi("/disconnect", {
          method: "POST",
        });

        await supabase
          .from("zapi_settings")
          .update({ is_connected: false, updated_at: new Date().toISOString() })
          .eq("id", settings.id);

        return new Response(JSON.stringify(disconnectData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "set-webhook": {
        const webhookUrl = typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : "";
        if (!webhookUrl) {
          return new Response(JSON.stringify({ error: "webhookUrl é obrigatório" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const webhookEndpoints = [
          "update-webhook-received",
          "update-webhook-delivery",
          "update-webhook-message-status",
          "update-webhook-connected",
          "update-webhook-disconnected",
        ];

        for (const endpoint of webhookEndpoints) {
          await callZapi(`/${endpoint}`, {
            method: "PUT",
            body: JSON.stringify({ value: webhookUrl }),
          });
        }

        await supabase
          .from("zapi_settings")
          .update({ webhook_url: webhookUrl, updated_at: new Date().toISOString() })
          .eq("id", settings.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-crm-contacts": {
        const { data: crmContacts, error } = await supabase
          .from("zapi_contacts")
          .select("*")
          .order("last_message_at", { ascending: false });
        if (error) throw error;
        return new Response(JSON.stringify({ contacts: crmContacts ?? [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update-crm-contact": {
        const contactId = data.contactId;
        if (!contactId) {
          return new Response(JSON.stringify({ error: "contactId obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (data.tags !== undefined) updates.tags = data.tags;
        if (data.crm_status !== undefined) updates.crm_status = data.crm_status;
        if (data.source !== undefined) updates.source = data.source;
        if (data.notes !== undefined) updates.notes = data.notes;
        if (data.is_hot_lead !== undefined) updates.is_hot_lead = data.is_hot_lead;

        const { error } = await supabase.from("zapi_contacts").update(updates).eq("id", contactId);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-flows": {
        const { data: flows, error } = await supabase
          .from("zapi_flows")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;

        const flowsWithSteps = [];
        for (const flow of (flows ?? [])) {
          const { data: steps } = await supabase
            .from("zapi_flow_steps")
            .select("*")
            .eq("flow_id", flow.id)
            .order("step_order", { ascending: true });
          flowsWithSteps.push({ ...flow, steps: (steps ?? []).map((s: Record<string, unknown>) => ({ ...s, button_options: s.button_options || [], button_actions: s.button_actions || [] })) });
        }

        return new Response(JSON.stringify({ flows: flowsWithSteps }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "save-flow": {
        const flowData = data.flow;
        const stepsData = data.steps;
        if (!flowData?.name) {
          return new Response(JSON.stringify({ error: "Nome do fluxo obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let flowId = flowData.id;
        if (flowId) {
          await supabase.from("zapi_flows").update({
            name: flowData.name,
            description: flowData.description || null,
            trigger_type: flowData.trigger_type || "manual",
            trigger_keywords: flowData.trigger_keywords || [],
            trigger_on_first_message: flowData.trigger_on_first_message || false,
            trigger_specific_text: flowData.trigger_specific_text || null,
            is_active: flowData.is_active !== false,
            updated_at: new Date().toISOString(),
          }).eq("id", flowId);

          await supabase.from("zapi_flow_steps").delete().eq("flow_id", flowId);
        } else {
          const { data: newFlow, error } = await supabase.from("zapi_flows").insert({
            name: flowData.name,
            description: flowData.description || null,
            trigger_type: flowData.trigger_type || "manual",
            trigger_keywords: flowData.trigger_keywords || [],
            trigger_on_first_message: flowData.trigger_on_first_message || false,
            trigger_specific_text: flowData.trigger_specific_text || null,
            is_active: flowData.is_active !== false,
          }).select("id").single();
          if (error) throw error;
          flowId = newFlow.id;
        }

        if (Array.isArray(stepsData)) {
          for (const step of stepsData) {
            await supabase.from("zapi_flow_steps").insert({
              flow_id: flowId,
              step_order: step.step_order || 0,
              step_type: step.step_type || "text",
              content: step.content || null,
              media_url: step.media_url || null,
              delay_seconds: step.delay_seconds || 2,
              simulate_typing: step.simulate_typing !== false,
              typing_duration_ms: step.typing_duration_ms || 3000,
              wait_for_reply: step.wait_for_reply || false,
              wait_timeout_seconds: step.wait_timeout_seconds || 300,
              button_text: step.button_text || null,
              button_options: step.button_options || [],
              button_actions: step.button_actions || [],
              wait_indefinitely: step.wait_indefinitely || false,
              followup_enabled: step.followup_enabled || false,
              followup_delay_seconds: step.followup_delay_seconds || 600,
              followup_type: step.followup_type || 'text',
              followup_content: step.followup_content || null,
              followup_media_url: step.followup_media_url || null,
              followup_flow_id: step.followup_flow_id || null,
            });
          }
        }

        return new Response(JSON.stringify({ success: true, flowId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete-flow": {
        const delFlowId = data.flowId;
        if (!delFlowId) {
          return new Response(JSON.stringify({ error: "flowId obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await supabase.from("zapi_flow_steps").delete().eq("flow_id", delFlowId);
        await supabase.from("zapi_flows").delete().eq("id", delFlowId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "execute-flow": {
        const execFlowId = data.flowId;
        const execPhone = normalizeBrazilianPhone(normalizePhone(data.phone));
        if (!execFlowId || !execPhone) {
          return new Response(JSON.stringify({ error: "flowId e phone obrigatórios" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: existingRunning } = await supabase
          .from("zapi_flow_executions")
          .select("id")
          .eq("phone", execPhone)
          .eq("status", "running")
          .limit(1)
          .maybeSingle();

        if (existingRunning) {
          return new Response(JSON.stringify({ success: true, skipped: "already_running", executionId: existingRunning.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: flowSteps } = await supabase
          .from("zapi_flow_steps")
          .select("*")
          .eq("flow_id", execFlowId)
          .order("step_order", { ascending: true });

        if (!flowSteps || flowSteps.length === 0) {
          return new Response(JSON.stringify({ error: "Fluxo sem passos" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: executionRow, error: executionError } = await supabase.from("zapi_flow_executions").insert({
          flow_id: execFlowId,
          phone: execPhone,
          status: "running",
        }).select("id").single();

        if (executionError || !executionRow?.id) {
          throw executionError || new Error("Não foi possível criar execução do fluxo.");
        }

        try {
          const result = await executeFlowSteps(executionRow.id, execPhone, flowSteps, 0);

          return new Response(JSON.stringify({
            success: true,
            executionId: executionRow.id,
            stepsExecuted: result.stepsExecuted,
            status: result.status,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (runError) {
          await supabase
            .from("zapi_flow_executions")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              last_step_at: new Date().toISOString(),
            })
            .eq("id", executionRow.id);

          throw runError;
        }
      }

      case "resume-execution": {
        const inputExecutionId = typeof data.executionId === "string" ? data.executionId : null;
        const inputPhone = data.phone ? normalizeBrazilianPhone(normalizePhone(data.phone)) : null;

        let executionQuery = supabase
          .from("zapi_flow_executions")
          .select("id, flow_id, phone, current_step, status")
          .eq("status", "paused")
          .order("started_at", { ascending: false })
          .limit(1);

        if (inputExecutionId) {
          executionQuery = executionQuery.eq("id", inputExecutionId);
        } else if (inputPhone) {
          executionQuery = executionQuery.eq("phone", inputPhone);
        }

        const { data: pausedExecution, error: pausedExecutionError } = await executionQuery.maybeSingle();

        if (pausedExecutionError) throw pausedExecutionError;

        if (!pausedExecution) {
          return new Response(JSON.stringify({ success: false, error: "Nenhuma execução pausada encontrada." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: flowSteps } = await supabase
          .from("zapi_flow_steps")
          .select("*")
          .eq("flow_id", pausedExecution.flow_id)
          .order("step_order", { ascending: true });

        if (!flowSteps || flowSteps.length === 0) {
          return new Response(JSON.stringify({ error: "Fluxo sem passos" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const currentStep = Number(pausedExecution.current_step ?? -1);
        const startIndex = flowSteps.findIndex((step) => Number(step.step_order ?? 0) > currentStep);
        const hasRemainingSteps = startIndex !== -1;

        // IMPORTANT: Process button actions BEFORE checking remaining steps,
        // because the buttons step might be the last step but still needs to trigger a flow/action
        const pausedStepData = flowSteps.find((s) => Number(s.step_order ?? 0) === currentStep);
        let shouldSkipRemainingSteps = false;

        if (pausedStepData?.step_type === "buttons" && pausedStepData.button_actions) {
          const buttonActions: any[] = Array.isArray(pausedStepData.button_actions) ? pausedStepData.button_actions : [];
          const buttonOptions: string[] = Array.isArray(pausedStepData.button_options) ? pausedStepData.button_options : [];

          const { data: lastMsg } = await supabase
            .from("zapi_messages")
            .select("content, metadata")
            .eq("phone", pausedExecution.phone)
            .eq("direction", "incoming")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const responseText = (lastMsg?.content || "").toLowerCase().trim();
          const selectedButtonId = (lastMsg?.metadata as any)?.selectedButtonId || "";
          const selectedDisplayText =
            (lastMsg?.metadata as any)?.selectedDisplayText ||
            (lastMsg?.metadata as any)?.selectedButtonText ||
            "";

          console.log("[Resume] Matching button response:", JSON.stringify({
            responseText, selectedButtonId, selectedDisplayText, buttonOptions
          }));

          let matchedActionIndex = -1;
          for (let bi = 0; bi < buttonOptions.length; bi++) {
            const optLower = buttonOptions[bi].toLowerCase().trim();
            const numericId = String(bi + 1); // buttons sent with id "1","2","3"
            if (
              responseText === optLower ||
              selectedButtonId === buttonOptions[bi] ||
              selectedButtonId.toLowerCase().trim() === optLower ||
              selectedButtonId === numericId ||
              selectedDisplayText.toLowerCase().trim() === optLower
            ) {
              matchedActionIndex = bi;
              break;
            }
          }

          console.log("[Resume] Matched action index:", matchedActionIndex);

          if (matchedActionIndex >= 0 && buttonActions[matchedActionIndex]) {
            const btnAction = buttonActions[matchedActionIndex];
            const execPhoneNorm = pausedExecution.phone;

            console.log("[Resume] Executing button action:", btnAction.action_type);

            if (btnAction.action_type === "text" && btnAction.content) {
              await callZapi("/send-text", {
                method: "POST",
                body: JSON.stringify({ phone: execPhoneNorm, message: btnAction.content }),
              });
              await supabase.from("zapi_messages").insert({
                phone: execPhoneNorm, direction: "outgoing", message_type: "text",
                content: btnAction.content, status: "sent", timestamp: Date.now(),
              });
            } else if (btnAction.action_type === "audio" && btnAction.media_url) {
              await callZapi("/send-audio", {
                method: "POST",
                body: JSON.stringify({ phone: execPhoneNorm, audio: btnAction.media_url, waveform: true }),
              });
              await supabase.from("zapi_messages").insert({
                phone: execPhoneNorm, direction: "outgoing", message_type: "audio",
                media_url: btnAction.media_url, status: "sent", timestamp: Date.now(),
              });
            } else if (btnAction.action_type === "image" && btnAction.media_url) {
              await callZapi("/send-image", {
                method: "POST",
                body: JSON.stringify({ phone: execPhoneNorm, image: btnAction.media_url, caption: btnAction.content || "" }),
              });
              await supabase.from("zapi_messages").insert({
                phone: execPhoneNorm, direction: "outgoing", message_type: "image",
                content: btnAction.content || "", media_url: btnAction.media_url, status: "sent", timestamp: Date.now(),
              });
            } else if (btnAction.action_type === "video" && btnAction.media_url) {
              await callZapi("/send-video", {
                method: "POST",
                body: JSON.stringify({ phone: execPhoneNorm, video: btnAction.media_url, caption: btnAction.content || "" }),
              });
              await supabase.from("zapi_messages").insert({
                phone: execPhoneNorm, direction: "outgoing", message_type: "video",
                content: btnAction.content || "", media_url: btnAction.media_url, status: "sent", timestamp: Date.now(),
              });
            } else if (btnAction.action_type === "flow" && btnAction.flow_id) {
              shouldSkipRemainingSteps = true;
              console.log("[Resume] Triggering target flow:", btnAction.flow_id);

              const nowIso = new Date().toISOString();
              await supabase
                .from("zapi_flow_executions")
                .update({
                  status: "completed",
                  completed_at: nowIso,
                  paused_at: null,
                  last_step_at: nowIso,
                })
                .eq("id", pausedExecution.id);

              // Check no other execution is running
              const { data: targetRunning } = await supabase
                .from("zapi_flow_executions")
                .select("id")
                .eq("phone", execPhoneNorm)
                .eq("status", "running")
                .limit(1)
                .maybeSingle();

              if (!targetRunning?.id) {
                const { data: targetSteps } = await supabase
                  .from("zapi_flow_steps")
                  .select("*")
                  .eq("flow_id", btnAction.flow_id)
                  .order("step_order", { ascending: true });

                if (targetSteps && targetSteps.length > 0) {
                  const { data: targetExec } = await supabase
                    .from("zapi_flow_executions")
                    .insert({ flow_id: btnAction.flow_id, phone: execPhoneNorm, status: "running" })
                    .select("id")
                    .single();

                  if (targetExec?.id) {
                    try {
                      const targetResult = await executeFlowSteps(targetExec.id, execPhoneNorm, targetSteps, 0);
                      console.log("[Resume] Target flow result:", targetResult.status, targetResult.stepsExecuted);
                    } catch (e) {
                      console.error("[Resume] Target flow error:", e);
                      await supabase.from("zapi_flow_executions").update({
                        status: "failed", completed_at: new Date().toISOString(),
                      }).eq("id", targetExec.id);
                    }
                  }
                } else {
                  console.error("[Resume] Target flow has no steps:", btnAction.flow_id);
                }
              } else {
                console.log("[Resume] Skipped: another execution already running");
              }
            } else if (btnAction.action_type === "continue") {
              console.log("[Resume] Continue action, proceeding with remaining steps");
            }
          } else {
            console.log("[Resume] No matching button action, proceeding with remaining steps");
          }
        }

        // If we switched to another flow, we're done
        if (shouldSkipRemainingSteps) {
          return new Response(JSON.stringify({
            success: true, executionId: pausedExecution.id, status: "completed", note: "Switched to another flow",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // No more steps to execute
        if (!hasRemainingSteps) {
          await supabase
            .from("zapi_flow_executions")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              paused_at: null,
              last_step_at: new Date().toISOString(),
            })
            .eq("id", pausedExecution.id);

          return new Response(JSON.stringify({ success: true, executionId: pausedExecution.id, status: "completed", stepsExecuted: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase
          .from("zapi_flow_executions")
          .update({ status: "running", paused_at: null })
          .eq("id", pausedExecution.id);

        try {
          const result = await executeFlowSteps(pausedExecution.id, pausedExecution.phone, flowSteps, startIndex);

          return new Response(JSON.stringify({
            success: true,
            executionId: pausedExecution.id,
            stepsExecuted: result.stepsExecuted,
            status: result.status,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (runError) {
          await supabase
            .from("zapi_flow_executions")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              last_step_at: new Date().toISOString(),
            })
            .eq("id", pausedExecution.id);

          throw runError;
        }
      }

      case "sync-whatsapp-contacts": {
        const { payload: waContacts } = await callZapi("/contacts");
        const contactsList = Array.isArray(waContacts) ? waContacts : (waContacts?.contacts || waContacts?.data || []);

        let synced = 0;
        if (Array.isArray(contactsList)) {
          for (const c of contactsList) {
            const rawId = String(c?.phone || c?.id || c?.jid || "");
            const cIsGroup = isGroupId(rawId);
            const rawPhone = normalizePhone(rawId);
            if (!rawPhone || !isRealPhone(rawPhone)) continue;
            const phone = normalizeBrazilianPhone(rawPhone);
            const name = c?.name || c?.pushName || c?.notify || null;
            if (name) {
              await supabase.from("zapi_contacts").upsert({
                phone,
                name,
                is_group: cIsGroup,
                updated_at: new Date().toISOString(),
              }, { onConflict: "phone" });
              synced++;
            }
          }
        }

        return new Response(JSON.stringify({ synced }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-profile-pic": {
        const rawPicPhone = normalizePhone(data.phone);
        let picApiPhone = rawPicPhone;
        const picDigits = rawPicPhone.replace(/\D/g, "");
        if (picDigits.length === 12 && picDigits.startsWith("55")) {
          const ddd = picDigits.slice(2, 4);
          const subscriber = picDigits.slice(4);
          picApiPhone = `55${ddd}9${subscriber}`;
        }
        const { payload: picData } = await callZapi(`/profile-picture/${picApiPhone}`);
        const picUrl = picData?.link || picData?.profilePictureUrl || picData?.url || null;
        
        // Save to DB if found
        if (picUrl) {
          const normalizedPicPhone = normalizeBrazilianPhone(rawPicPhone);
          await supabase
            .from("zapi_contacts")
            .update({ profile_pic_url: picUrl, updated_at: new Date().toISOString() })
            .eq("phone", normalizedPicPhone);
        }
        
        return new Response(JSON.stringify({ url: picUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-contact-info": {
        const rawInfoPhone = normalizePhone(data.phone);
        let infoApiPhone = rawInfoPhone;
        const infoDigits = rawInfoPhone.replace(/\D/g, "");
        if (infoDigits.length === 12 && infoDigits.startsWith("55")) {
          const ddd = infoDigits.slice(2, 4);
          const subscriber = infoDigits.slice(4);
          infoApiPhone = `55${ddd}9${subscriber}`;
        }
        
        // Get contact business profile / about info from Z-API
        const [profilePicRes, businessRes] = await Promise.all([
          callZapi(`/profile-picture/${infoApiPhone}`),
          callZapi(`/contact-business-profile/${infoApiPhone}`).catch(() => ({ payload: null })),
        ]);
        
        const profilePic = profilePicRes.payload?.link || profilePicRes.payload?.profilePictureUrl || null;
        const business = businessRes.payload;
        
        return new Response(JSON.stringify({
          profile_pic: profilePic,
          business_profile: business,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-active-executions": {
        const execPhone = data.phone ? normalizeBrazilianPhone(normalizePhone(data.phone)) : null;
        
        let query = supabase
          .from("zapi_flow_executions")
          .select("id, flow_id, phone, current_step, status, started_at, paused_at")
          .in("status", ["running", "paused"])
          .order("started_at", { ascending: false });

        if (execPhone) {
          query = query.eq("phone", execPhone);
        }

        const { data: executions, error } = await query;
        if (error) throw error;

        // Enrich with flow names
        const enriched = [];
        for (const exec of (executions ?? [])) {
          const { data: flow } = await supabase
            .from("zapi_flows")
            .select("name")
            .eq("id", exec.flow_id)
            .maybeSingle();
          enriched.push({
            ...exec,
            flow_name: flow?.name || "Fluxo desconhecido",
          });
        }

        return new Response(JSON.stringify({ executions: enriched }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "cancel-execution": {
        const cancelId = data.executionId;
        if (!cancelId) {
          return new Response(JSON.stringify({ error: "executionId obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error } = await supabase
          .from("zapi_flow_executions")
          .update({ status: "cancelled", completed_at: new Date().toISOString() })
          .eq("id", cancelId);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Z-API proxy error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
