
-- =============================================
-- FIX 1: metodo_seguidor tables - Replace USING(true) with explicit service_role check
-- =============================================

-- Drop old permissive policies
DROP POLICY IF EXISTS "Service role can manage users" ON public.metodo_seguidor_users;
DROP POLICY IF EXISTS "Service role can manage orders" ON public.metodo_seguidor_orders;
DROP POLICY IF EXISTS "Service role can manage modules" ON public.metodo_seguidor_modules;
DROP POLICY IF EXISTS "Service role can manage videos" ON public.metodo_seguidor_videos;

-- Create explicit service role policies
CREATE POLICY "Service role full access"
ON public.metodo_seguidor_users
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access"
ON public.metodo_seguidor_orders
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access"
ON public.metodo_seguidor_modules
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access"
ON public.metodo_seguidor_videos
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- FIX 2: Storage buckets - Remove public write/update/delete access
-- =============================================

-- Drop dangerous public write policies on assets bucket
DROP POLICY IF EXISTS "Allow public uploads to assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from assets" ON storage.objects;

-- Drop dangerous public write policies on trial-screenshots bucket
DROP POLICY IF EXISTS "Anyone can upload trial screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update trial screenshots" ON storage.objects;

-- Create service-role-only write policies for assets
CREATE POLICY "Service role write assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'assets' AND auth.role() = 'service_role');

CREATE POLICY "Service role update assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'assets' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'assets' AND auth.role() = 'service_role');

CREATE POLICY "Service role delete assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'assets' AND auth.role() = 'service_role');

-- Create service-role-only write policies for trial-screenshots
CREATE POLICY "Service role write trial screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'trial-screenshots' AND auth.role() = 'service_role');

CREATE POLICY "Service role update trial screenshots"
ON storage.objects FOR UPDATE
USING (bucket_id = 'trial-screenshots' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'trial-screenshots' AND auth.role() = 'service_role');

-- =============================================
-- FIX 3: payment_orders - Remove public read access
-- =============================================

-- Drop overly permissive read policy
DROP POLICY IF EXISTS "Anyone can read own payment order" ON public.payment_orders;

-- Drop overly permissive insert policy  
DROP POLICY IF EXISTS "Anyone can create payment order" ON public.payment_orders;

-- Create service-role-only insert policy (checkout via edge functions only)
CREATE POLICY "Service role insert payment orders"
ON public.payment_orders FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Create service-role-only read policy
CREATE POLICY "Service role read payment orders"
ON public.payment_orders FOR SELECT
USING (auth.role() = 'service_role');

-- =============================================
-- FIX 4: mro_orders - Tighten overly permissive policies
-- =============================================

-- Drop dangerous public delete and read policies
DROP POLICY IF EXISTS "Anyone can delete mro orders" ON public.mro_orders;
DROP POLICY IF EXISTS "Anyone can read mro orders" ON public.mro_orders;
DROP POLICY IF EXISTS "Anyone can create mro order" ON public.mro_orders;

-- Keep insert public (needed for checkout flow) but restrict read/delete to service role
CREATE POLICY "Public can create mro order"
ON public.mro_orders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role read mro orders"
ON public.mro_orders FOR SELECT
USING (auth.role() = 'service_role');

CREATE POLICY "Service role delete mro orders"
ON public.mro_orders FOR DELETE
USING (auth.role() = 'service_role');
