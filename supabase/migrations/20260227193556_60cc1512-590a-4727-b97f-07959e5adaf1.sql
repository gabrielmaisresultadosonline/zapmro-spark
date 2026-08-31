
-- Table to store known followers to detect new ones
CREATE TABLE public.mro_direct_known_followers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_account_id text NOT NULL,
  follower_id text NOT NULL,
  follower_username text,
  welcomed boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(instagram_account_id, follower_id)
);

ALTER TABLE public.mro_direct_known_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on mro_direct_known_followers"
ON public.mro_direct_known_followers
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

CREATE INDEX idx_known_followers_account ON public.mro_direct_known_followers(instagram_account_id);
