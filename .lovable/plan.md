# Separar totalmente cada número de WhatsApp dentro do mesmo cadastro

## Diagnóstico (por que está misturado)

Hoje o cadastro tem vários números em `crm_whatsapp_numbers`, mas:

1. **Contatos e mensagens não têm dono de número.** `crm_contacts` e `crm_messages` são filtrados só por `user_id`. Índice único atual: `(wa_id, user_id)` — ou seja, o mesmo cliente só pode existir uma vez no cadastro, mesmo que tenha falado com dois números diferentes. Resultado: as duas caixas de entrada viram uma só.
2. **Trocar de número apenas sobrescreve `crm_settings`.** `activateNumber()` copia token/phone_number_id do número escolhido para a única linha de `crm_settings`. Todo o envio (CRM, fluxos, disparos, IA, webhooks) lê `crm_settings`, então quem envia é sempre "o último ativado", não o número da conversa.
3. **Por isso aparece "Re-engagement message".** A conversa foi recebida pelo número A, mas o envio sai pelo número B: para o número B aquele cliente nunca escreveu, então a janela de 24 h não existe e a Meta exige template — o erro de re-engajamento.
4. **O webhook de entrada** resolve o `user_id` pelo `phone_number_id`, mas grava contato/mensagem sem registrar por qual número entrou, e responde com as credenciais de `crm_settings`.

## O que vai ser feito

### 1. Banco de dados (novo `deploy/postgres-stack/sql/088-conversas-por-numero.sql`, idempotente)

- `ALTER TABLE crm_contacts ADD COLUMN whatsapp_number_id uuid` (FK para `crm_whatsapp_numbers`, `ON DELETE CASCADE`) + índice.
- Mesma coluna em `crm_messages`, `crm_broadcasts` / logs de disparo e `crm_webhooks` (para o webhook responder pelo número certo).
- **Backfill sem perder nada:** todo registro existente recebe o número atualmente ativo do usuário (match por `crm_settings.meta_phone_number_id`, com fallback para o número mais antigo do cadastro). Nenhum dado é apagado.
- Troca do índice único: `(wa_id, user_id)` → `(wa_id, user_id, whatsapp_number_id)`, permitindo o mesmo cliente em caixas diferentes. O antigo é removido só depois do backfill.
- GRANTs/RLS mantidos como já estão (política por `user_id` continua valendo; a separação por número é escopo de aplicação, não de segurança).

### 2. Envio sempre pelo número da conversa

- `src/lib/whatsappNumbers.ts`: expor `getActiveNumber()` (registro completo, não só o id) e manter o espelho em `crm_settings` apenas por compatibilidade.
- `src/pages/CRM.tsx`: todas as leituras de `crm_contacts`/`crm_messages` passam a filtrar `.eq('whatsapp_number_id', activeNumberId)`, e todo insert grava a coluna. Isso inclui lista de conversas, cache local (chave do cache passa a incluir o número), realtime (assinaturas ignoram payload de outro número), busca, disparos, importação de contatos e exclusões.
- Envio (`sendMessage`, fluxos, Broadcaster) passa `whatsapp_number_id` para a função e a função usa o token/phone_number_id **daquele** número — não mais o de `crm_settings`.

### 3. Edge Functions

- `meta-whatsapp-crm`: ao receber webhook, resolver o número em `crm_whatsapp_numbers` por `meta_phone_number_id` (fallback em `crm_settings`) e usar aquele token para responder; gravar `whatsapp_number_id` em contato e mensagem; buscar contato por `(user_id, wa_id, whatsapp_number_id)`.
- `crm-webhook` e `_shared/flow-executor.ts`: mesma resolução por número, herdando o número do contato.

### 4. UI

- Cabeçalho do CRM mostra o número ativo ao lado dos botões existentes (TROCAR WHATSAPP / FLUXOS / CRM), sem mudar layout.
- Ao trocar de número, a lista de conversas é recarregada limpando cache e estado — nada de resíduo da outra caixa.

## Sequência de entrega

1. Migração SQL + backfill.
2. `whatsappNumbers.ts` e escopo no `CRM.tsx`.
3. Edge Functions (entrada e envio).
4. Comando de atualização na VPS (`git pull` + `./deploy/atualizar.sh`, que aplica o 088 e redeploya as funções).

## Garantias

- Nada é excluído: apenas colunas novas e reindexação; os dados atuais ficam vinculados ao número ativo de hoje.
- Depois disso cada número tem histórico, contatos, disparos e fluxos próprios, e o envio nunca sai pelo número errado — eliminando o erro de "Re-engagement message".
- Todo o resto do sistema permanece igual.
