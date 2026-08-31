
-- FIX 1: mro_orders PII exposure
CREATE VIEW public.mro_orders_public
WITH (security_invoker = on) AS
  SELECT id, status, paid_at, completed_at, nsu_order, plan_type, amount, created_at, updated_at, api_created, email_sent
  FROM public.mro_orders;

DROP POLICY IF EXISTS "Anyone can read mro orders" ON public.mro_orders;

-- FIX 2: Realtime channel data leak
ALTER PUBLICATION supabase_realtime DROP TABLE public.free_trial_registrations;
ALTER PUBLICATION supabase_realtime DROP TABLE public.zapi_messages;
ALTER PUBLICATION supabase_realtime DROP TABLE public.zapi_contacts;
ALTER PUBLICATION supabase_realtime DROP TABLE public.mro_direct_logs;

-- FIX 3: zapmro_users policy misconfiguration
DROP POLICY IF EXISTS "Service role full access on zapmro_users" ON public.zapmro_users;

CREATE POLICY "Service role full access on zapmro_users"
ON public.zapmro_users
FOR ALL
TO public
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);
