
CREATE TABLE IF NOT EXISTS public.mro_direct_ai_pauses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id text NOT NULL UNIQUE,
  is_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mro_direct_ai_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on mro_direct_ai_pauses" 
ON public.mro_direct_ai_pauses 
FOR ALL 
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);
