ALTER TABLE public.zapi_flow_steps
ADD COLUMN IF NOT EXISTS wait_indefinitely boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS followup_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS followup_delay_seconds integer DEFAULT 600,
ADD COLUMN IF NOT EXISTS followup_type text DEFAULT 'text',
ADD COLUMN IF NOT EXISTS followup_content text,
ADD COLUMN IF NOT EXISTS followup_media_url text,
ADD COLUMN IF NOT EXISTS followup_flow_id text;