-- Add campaign activation fields to ads_client_data
ALTER TABLE public.ads_client_data 
ADD COLUMN IF NOT EXISTS campaign_active boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS campaign_activated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS campaign_end_date timestamp with time zone;