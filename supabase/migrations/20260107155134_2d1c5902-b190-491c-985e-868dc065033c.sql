-- Fix RLS for ads_users table - Remove permissive policy and add service role only
DROP POLICY IF EXISTS "Allow all via service role" ON public.ads_users;
CREATE POLICY "Service role only on ads_users" 
ON public.ads_users 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix RLS for ads_admins table
DROP POLICY IF EXISTS "Allow all via service role" ON public.ads_admins;
CREATE POLICY "Service role only on ads_admins" 
ON public.ads_admins 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix RLS for ads_orders table
DROP POLICY IF EXISTS "Allow all via service role" ON public.ads_orders;
CREATE POLICY "Service role only on ads_orders" 
ON public.ads_orders 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix RLS for ads_client_data table
DROP POLICY IF EXISTS "Allow all via service role" ON public.ads_client_data;
CREATE POLICY "Service role only on ads_client_data" 
ON public.ads_client_data 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix RLS for ads_balance_orders table
DROP POLICY IF EXISTS "Allow all via service role" ON public.ads_balance_orders;
CREATE POLICY "Service role only on ads_balance_orders" 
ON public.ads_balance_orders 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');