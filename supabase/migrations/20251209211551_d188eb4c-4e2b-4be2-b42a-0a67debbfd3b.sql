-- Add password column to paid_users
ALTER TABLE public.paid_users ADD COLUMN IF NOT EXISTS password TEXT;