-- Add expiration_date column to created_accesses
ALTER TABLE public.created_accesses 
ADD COLUMN IF NOT EXISTS expiration_date timestamp with time zone;