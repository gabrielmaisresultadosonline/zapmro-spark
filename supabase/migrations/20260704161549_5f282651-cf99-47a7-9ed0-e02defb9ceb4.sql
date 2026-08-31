
ALTER TABLE public.crm_settings ADD COLUMN IF NOT EXISTS save_deleted_messages boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS deleted_by text;
CREATE INDEX IF NOT EXISTS crm_messages_deleted_idx ON public.crm_messages(contact_id, is_deleted) WHERE is_deleted = true;
