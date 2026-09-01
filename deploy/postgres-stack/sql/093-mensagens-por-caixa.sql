-- 093 — Reparo do histórico por caixa (multi-número)
--
-- Contexto: com dois números no mesmo cadastro, mensagens enviadas foram
-- gravadas sem `whatsapp_number_id` (e algumas sem `user_id`), o que fazia a
-- mensagem "sair" no WhatsApp mas não aparecer na conversa aberta na tela.
-- Este script é idempotente: pode rodar quantas vezes for necessário.

BEGIN;

-- 1) Herdar a caixa do contato quando a mensagem não tem número definido.
UPDATE crm_messages m
SET whatsapp_number_id = c.whatsapp_number_id
FROM crm_contacts c
WHERE m.contact_id = c.id
  AND m.whatsapp_number_id IS NULL
  AND c.whatsapp_number_id IS NOT NULL;

-- 2) Herdar o dono do contato quando a mensagem ficou sem user_id
--    (o chat filtra por user_id: sem isso a mensagem desaparecia ao recarregar).
UPDATE crm_messages m
SET user_id = c.user_id
FROM crm_contacts c
WHERE m.contact_id = c.id
  AND m.user_id IS NULL
  AND c.user_id IS NOT NULL;

-- 3) Índices de leitura do chat e das telas escopadas por número.
CREATE INDEX IF NOT EXISTS crm_messages_contact_created_idx
  ON crm_messages (contact_id, created_at);

CREATE INDEX IF NOT EXISTS crm_messages_user_number_created_idx
  ON crm_messages (user_id, whatsapp_number_id, created_at DESC);

COMMIT;

-- Conferência rápida (não altera nada):
--   SELECT count(*) AS sem_caixa FROM crm_messages WHERE whatsapp_number_id IS NULL;
--   SELECT count(*) AS sem_dono  FROM crm_messages WHERE user_id IS NULL;
