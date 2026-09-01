# Plano: fazer o número em Coexistência (SMB) receber mensagens

## Diagnóstico (o que os logs provam)

O número `+55 67 9875-3004` (`1277217672141708`) está em **Coexistência / SMB**:

- `platform_type: CLOUD_API`, `status: CONNECTED`, mas `code_verification_status: NOT_VERIFIED`.
- `/register` responde `Register endpoint is not available for SMB businesses` e `/two_step_verification` não existe nesse modo.

Isso **não é bug do nosso sistema e não tem correção via `/register`**: números onboardados em Coexistência ficam permanentemente `NOT_VERIFIED` e continuam funcionando no celular. Nesse modo a Meta só entrega conversas para a Cloud API se o webhook estiver assinando os **campos de coexistência**.

O ponto que é nosso: hoje o app assina apenas o campo `messages` (comentário explícito em `supabase/functions/meta-whatsapp-crm/index.ts`, na função de inscrição do webhook). Sem `smb_message_echoes` / `smb_app_state_sync` / `history`, a caixa em coexistência fica exatamente como está: zerada. O handler de `message_echoes` já existe no webhook, mas o campo nunca é assinado nem o nome SMB do campo é reconhecido.

## O que será implementado

### 1. Assinatura do webhook com os campos de coexistência (com degradação segura)
Em `meta-whatsapp-crm`, na inscrição de app (`POST /{APP_ID}/subscriptions`):

- 1ª tentativa: `messages,smb_message_echoes,smb_app_state_sync,history,message_template_status_update`.
- Se a Meta recusar por permissão (o motivo do comentário atual), **retry automático apenas com `messages`**, registrando o campo recusado no log. Assim nunca voltamos a quebrar o recebimento das outras caixas.
- Resultado (campos efetivamente aceitos) devolvido no retorno para aparecer no diagnóstico.

### 2. Reconhecer os payloads SMB no webhook
No roteamento por `changes[].field`:

- `smb_message_echoes` → tratar como `message_echoes` (reaproveita o handler já existente de mensagem enviada pelo celular).
- Aceitar echoes vindos tanto em `value.message_echoes` quanto em `value.smb_message_echoes`.
- `smb_app_state_sync` e `history` → log estruturado + ingestão idempotente das mensagens de histórico (mesma dedupe por `meta_message_id`), sempre com `whatsapp_number_id` da caixa, para não misturar números.
- Nenhuma mudança no fluxo `messages` atual.

### 3. Script de reparo `deploy/reparar-coexistencia.sh`
Um comando único para rodar na VPS, por `PHONE_NUMBER_ID`:

1. Lê token/WABA da caixa no Postgres (mesma lógica do diagnóstico atual).
2. `GET /{APP_ID}/subscriptions` — mostra quais campos estão assinados hoje.
3. Reassina com os campos SMB (com fallback igual ao item 1).
4. `POST /{WABA}/subscribed_apps` (idempotente).
5. Reimprime `GET /{PHONE_NUMBER_ID}` e escuta o tráfego por 90s, indicando se chegou algo.

### 4. Diagnóstico e mensagens
- `deploy/diagnosticar-um-numero.sh`: passa a exibir os campos assinados do app e alerta explicitamente quando a caixa é SMB e falta `smb_message_echoes`.
- `deploy/registrar-numero-cloudapi.sh`: em modo SMB, para de tentar PIN e aponta para o novo script de reparo.

## Limite honesto do que o código resolve

Se o cliente **não concluiu a etapa de sincronizar o app** no Embedded Signup (celular: Configurações > Ferramentas comerciais > API), nenhuma assinatura de webhook fará mensagens chegarem — a WABA existe mas sem vínculo de conversas. Nesse caso as opções são:

- refazer o Embedded Signup no CRM até o fim, aceitando a sync no celular; ou
- migrar o número de verdade para Cloud API (sai do app WhatsApp Business), aí `/register` + PIN passam a funcionar e o número vira `VERIFIED`.

O plano acima garante que, do nosso lado, tudo que é necessário esteja assinado e tratado.

## Passos na VPS após o deploy

```bash
cd /var/www/ia-mro && git fetch origin && git reset --hard origin/main
./deploy/atualizar.sh
./deploy/reparar-coexistencia.sh 1277217672141708
```

## Arquivos afetados

- `supabase/functions/meta-whatsapp-crm/index.ts` (assinatura de campos + roteamento SMB)
- `deploy/reparar-coexistencia.sh` (novo)
- `deploy/diagnosticar-um-numero.sh`, `deploy/registrar-numero-cloudapi.sh` (relatório/orientação)
