-- Add competitor Instagram links and media URLs columns to ads_client_data
ALTER TABLE public.ads_client_data 
ADD COLUMN IF NOT EXISTS competitor1_instagram TEXT,
ADD COLUMN IF NOT EXISTS competitor2_instagram TEXT,
ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';