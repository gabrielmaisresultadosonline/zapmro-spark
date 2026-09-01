# Correção: mensagem enviada não fica salva no chat (multi-número)

## Diagnóstico

Os logs mostram o WhatsApp funcionando: webhook recebe, eco do celular é salvo, status `delivered` chega. O problema não é a Meta — é **onde a mensagem enviada é gravada** depois que passamos a separar conversas por número (caixa).

Três falhas encontradas no código:

1. **`sendMessage` no servidor ignora o número aberto.**
   Em `supabase/functions/meta-whatsapp-crm/index.ts` (ação `sendMessage`), o contato é buscado apenas por `wa_id + user_id`, sem `whatsapp_number_id`, ordenado por `last_message_received_at`. Num cadastro com 2 números, o mesmo cliente tem 2 linhas de contato — o envio grava na linha da **outra** caixa. A mensagem sai no WhatsApp, mas a conversa aberta na tela nunca a mostra.

2. **Mensagens gravadas sem `whatsapp_number_id`.**
   Os `insert` em `crm_messages` de `internalSendMessage` e `internalSendTemplate` não preenchem a coluna da caixa. Todas as telas escopadas por número (prévia da lista, contadores, estatísticas, realtime) ficam sem esses registros.

3. **Áudio enviado pela tela grava sem `user_id`.**
   Em `src/pages/CRM.tsx`, o insert de áudio manual não envia `user_id` nem `whatsapp_number_id`, enquanto `fetchMessages` filtra `.eq('user_id', ...)`. Resultado: o áudio aparece na hora (otimista) e desaparece ao recarregar.

O ruído `[GOOGLE-SYNC] 403` é independente (tokens sem escopo de Contatos) e será silenciado no caminho de deduplicação, que ainda não respeita o circuit breaker.

## O que será feito

### 1. Envio escopado por caixa (servidor)
- `sendMessage` e `sendTemplate` passam a receber `whatsapp_number_id` do frontend; quando ausente, resolvem a caixa pelo `meta_phone_number_id` consultando `crm_whatsapp_numbers` (mesma lógica já usada pelo webhook).
- Busca do contato filtrada pela caixa; criação de contato já com `whatsapp_number_id`.
- Fallback seguro: se nenhuma caixa for resolvida, comportamento atual é mantido (contas de número único não regridem).

### 2. Gravação completa da mensagem
- `internalSendMessage` e `internalSendTemplate` gravam `whatsapp_number_id` (herdado do contato quando o parâmetro não vier) e `user_id` sempre preenchido.

### 3. Frontend
- Todas as chamadas de envio (texto, mídia, áudio, template) passam o número ativo.
- Insert de áudio manual inclui `user_id` e `whatsapp_number_id`.

### 4. Migração 093 — reparo dos dados já gravados
- Preenche `crm_messages.whatsapp_number_id` a partir do contato quando nulo.
- Preenche `crm_messages.user_id` nulo a partir do contato.
- Índice em `(contact_id, created_at)` conferido para manter o chat rápido.

### 5. Silenciar 403 do Google
- A rotina de deduplicação marca a conta como `reconnect_required` no primeiro erro de escopo, igual ao push, parando a repetição no log.

## Como validar na VPS

```bash
cd /var/www/ia-mro && git fetch origin && git reset --hard origin/main
chmod +x deploy/*.sh && ./deploy/atualizar.sh
docker logs -f --since 2m zapmro-functions | grep -iE 'META-SEND|FLOW-LOG|093'
```

Depois: abrir `/crm` no número onde falhava, enviar texto e áudio, recarregar a página — as duas mensagens devem permanecer no histórico da conversa correta.

## Limite honesto
Mensagens antigas que foram gravadas na caixa errada continuam na conversa da outra caixa; a migração preenche a coluna faltante, mas não adivinha a caixa de origem quando o contato já estava errado. Se quiser, posso adicionar depois uma rotina de realocação por `meta_message_id`.
