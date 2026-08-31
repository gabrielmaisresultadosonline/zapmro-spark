
ALTER TABLE public.mro_direct_settings 
ADD COLUMN IF NOT EXISTS follower_count_baseline integer,
ADD COLUMN IF NOT EXISTS follower_polling_active boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_follower_check timestamp with time zone,
ADD COLUMN IF NOT EXISTS instagram_username text,
ADD COLUMN IF NOT EXISTS follower_check_threshold integer DEFAULT 2;
