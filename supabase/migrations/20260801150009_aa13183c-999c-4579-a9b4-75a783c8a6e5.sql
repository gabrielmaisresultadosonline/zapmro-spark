ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_google_synced_at
  ON public.crm_contacts (user_id, google_synced_at)
  WHERE google_sync_account_id IS NOT NULL;