
-- Fix: Restore public SELECT on mro_orders (needed by client-side admin panel)
-- The previous migration over-restricted this table
CREATE POLICY "Anyone can read mro orders"
ON public.mro_orders FOR SELECT
USING (true);

-- Drop the redundant service-role-only SELECT policy (the ALL policy already covers service_role)
DROP POLICY IF EXISTS "Service role read mro orders" ON public.mro_orders;

-- Drop the redundant service-role-only DELETE policy (the ALL policy already covers service_role)
DROP POLICY IF EXISTS "Service role delete mro orders" ON public.mro_orders;
