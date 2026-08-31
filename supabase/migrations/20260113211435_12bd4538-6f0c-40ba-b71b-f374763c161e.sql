-- ============================================
-- SECURITY FIX: Restrict public access to sensitive tables
-- and remove exposed admin credentials
-- ============================================

-- ===========================================
-- 1. Fix free_trial_registrations table - Remove public access
-- ===========================================

-- Drop ALL dangerous public policies on free_trial_registrations
DROP POLICY IF EXISTS "Anyone can check trial status" ON public.free_trial_registrations;
DROP POLICY IF EXISTS "Anyone can register for trial" ON public.free_trial_registrations;
DROP POLICY IF EXISTS "Anyone can update trial registrations" ON public.free_trial_registrations;
DROP POLICY IF EXISTS "Anyone can delete trial registrations" ON public.free_trial_registrations;

-- Create service-role-only policy (edge functions handle all operations)
CREATE POLICY "Service role only access on trial registrations"
ON public.free_trial_registrations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ===========================================
-- 2. Fix free_trial_settings table - Remove public access and credentials
-- ===========================================

-- Drop dangerous public policies
DROP POLICY IF EXISTS "Anyone can read trial settings" ON public.free_trial_settings;
DROP POLICY IF EXISTS "Anyone can update trial settings" ON public.free_trial_settings;

-- Create service-role-only policy
CREATE POLICY "Service role only access on trial settings"
ON public.free_trial_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Remove exposed admin credentials columns from database
ALTER TABLE public.free_trial_settings
DROP COLUMN IF EXISTS admin_email,
DROP COLUMN IF EXISTS admin_password;

-- ===========================================
-- 3. Fix metodo_seguidor_admins - Ensure proper service role check
-- ===========================================

-- Drop existing policy with USING(true)
DROP POLICY IF EXISTS "Service role can manage admins" ON public.metodo_seguidor_admins;

-- Create explicit service-role-only policy with proper role check
CREATE POLICY "Service role only access on admins"
ON public.metodo_seguidor_admins
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');