-- Drop the restrictive select policy and create one that allows public read for admin dashboard
DROP POLICY IF EXISTS "Anyone can read own mro order by email" ON public.mro_orders;

-- Create a policy that allows anyone to read all orders (needed for admin dashboard)
CREATE POLICY "Anyone can read mro orders" 
ON public.mro_orders 
FOR SELECT 
USING (true);