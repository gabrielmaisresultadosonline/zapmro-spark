-- Add instagram_user_id column for messaging (separate from API node ID)
ALTER TABLE public.mro_direct_settings
ADD COLUMN IF NOT EXISTS instagram_user_id text;

-- Set existing value from the old account_id (which was the user_id)
UPDATE public.mro_direct_settings
SET instagram_user_id = '17841464469872193'
WHERE instagram_account_id = '27048263218108962' AND instagram_user_id IS NULL;