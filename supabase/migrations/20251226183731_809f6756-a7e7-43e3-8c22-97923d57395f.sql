-- Add offer_description column to ads_client_data
ALTER TABLE public.ads_client_data 
ADD COLUMN IF NOT EXISTS offer_description TEXT;

COMMENT ON COLUMN public.ads_client_data.offer_description IS 'Descrição da oferta com palavras do cliente';