-- Add expiration notification tracking columns
ALTER TABLE public.created_accesses 
ADD COLUMN IF NOT EXISTS expiration_warning_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS expiration_warning_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS expired_notification_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS expired_notification_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS email_opened boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_opened_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS tracking_id text UNIQUE;