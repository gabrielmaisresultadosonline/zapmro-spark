-- Drop existing restrictive INSERT policy
DROP POLICY IF EXISTS "Anyone can insert " ON public.paid_users;

-- Create permissive INSERT policy for public registration
CREATE POLICY "Allow public registration"
ON public.paid_users
FOR INSERT
TO public
WITH CHECK (true);