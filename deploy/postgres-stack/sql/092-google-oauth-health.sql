-- 092 — Saúde da conexão Google (corrige loop de erros 403 no Auto Sync)
--
-- Por que: contas antigas guardam refresh_token sem o escopo de escrita
-- (https://www.googleapis.com/auth/contacts). O cron roda a cada minuto e
-- tenta sincronizar infinitamente, enchendo os logs com
-- "Request had insufficient authentication scopes" (403).
--
-- Estas colunas permitem marcar a conta como "reconnect_required" e parar
-- de tentar até o usuário reconectar concedendo a permissão de Contatos.

ALTER TABLE public.crm_google_accounts
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS granted_scopes TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_google_accounts_connection_status_check'
  ) THEN
    ALTER TABLE public.crm_google_accounts
      ADD CONSTRAINT crm_google_accounts_connection_status_check
      CHECK (connection_status IN ('active', 'reconnect_required', 'token_error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_google_accounts_autosync_status_idx
  ON public.crm_google_accounts (auto_sync, connection_status);

-- Contas que já falham por escopo continuam ativas até a próxima tentativa;
-- a Edge Function marca o status assim que o 403 acontecer.
