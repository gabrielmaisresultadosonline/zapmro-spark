ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS countdown_trigger_last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS countdown_trigger_total_sent INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS countdown_trigger_scope TEXT NOT NULL DEFAULT 'always';

DO $$ BEGIN
  ALTER TABLE public.crm_settings ADD CONSTRAINT crm_settings_countdown_scope_check CHECK (countdown_trigger_scope IN ('always','once'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.crm_contacts
SET countdown_trigger_last_sent_at = countdown_trigger_sent_at,
    countdown_trigger_total_sent = 1
WHERE countdown_trigger_sent_at IS NOT NULL
  AND countdown_trigger_last_sent_at IS NULL;