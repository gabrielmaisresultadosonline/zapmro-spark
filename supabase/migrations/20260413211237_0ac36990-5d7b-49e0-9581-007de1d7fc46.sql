
-- 1. Fix whatsapp_page_settings: restrict to service_role only
DROP POLICY IF EXISTS "Allow public read on whatsapp_page_settings" ON public.whatsapp_page_settings;
DROP POLICY IF EXISTS "Allow public update on whatsapp_page_settings" ON public.whatsapp_page_settings;
DROP POLICY IF EXISTS "Anyone can read whatsapp_page_settings" ON public.whatsapp_page_settings;
DROP POLICY IF EXISTS "Anyone can update whatsapp_page_settings" ON public.whatsapp_page_settings;
DROP POLICY IF EXISTS "Public read on whatsapp_page_settings" ON public.whatsapp_page_settings;
DROP POLICY IF EXISTS "Public update on whatsapp_page_settings" ON public.whatsapp_page_settings;

CREATE POLICY "Service role only on whatsapp_page_settings"
ON public.whatsapp_page_settings
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. Fix mro_euro_orders: remove public SELECT
DROP POLICY IF EXISTS "Anyone can read euro orders" ON public.mro_euro_orders;

-- 3. Fix corretor_orders: restrict to service_role
DROP POLICY IF EXISTS "Allow service role full access" ON public.corretor_orders;

CREATE POLICY "Service role only on corretor_orders"
ON public.corretor_orders
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 4. Fix metodo_seguidor_upsells: restrict management to service_role
DROP POLICY IF EXISTS "Service role can manage upsells" ON public.metodo_seguidor_upsells;

CREATE POLICY "Service role can manage upsells"
ON public.metodo_seguidor_upsells
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 5. Fix user-data storage bucket policy
DROP POLICY IF EXISTS "Service role access for user data" ON storage.objects;

CREATE POLICY "Service role access for user data"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'user-data' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'user-data' AND auth.role() = 'service_role');

-- 6. Fix corretor_announcement_views: restrict SELECT
DROP POLICY IF EXISTS "Allow public read on corretor_announcement_views" ON public.corretor_announcement_views;

CREATE POLICY "Service role read on corretor_announcement_views"
ON public.corretor_announcement_views
FOR SELECT
TO public
USING (auth.role() = 'service_role');
