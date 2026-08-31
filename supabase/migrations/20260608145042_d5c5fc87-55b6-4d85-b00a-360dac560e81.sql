-- Remove a restrição de unicidade global na coluna wa_id
ALTER TABLE public.crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_wa_id_key;

-- Cria um índice de unicidade composto (wa_id + user_id) para que o mesmo número possa existir em contas diferentes
-- mas continue sendo único dentro da mesma conta de usuário.
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_wa_id_user_id_idx ON public.crm_contacts (wa_id, user_id);
