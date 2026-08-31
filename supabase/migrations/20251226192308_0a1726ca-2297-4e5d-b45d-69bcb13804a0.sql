-- Add edit_count column to track how many times client data was edited
ALTER TABLE public.ads_client_data 
ADD COLUMN IF NOT EXISTS edit_count integer DEFAULT 0;