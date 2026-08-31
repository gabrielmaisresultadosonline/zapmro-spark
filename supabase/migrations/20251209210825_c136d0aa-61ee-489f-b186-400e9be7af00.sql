-- Drop existing INSERT policies
DROP POLICY IF EXISTS "Anyone can insert " ON public.paid_users;
DROP POLICY IF EXISTS "Anyone can insert" ON public.paid_users;
DROP POLICY IF EXISTS "Allow public registration" ON public.paid_users;

-- Create INSERT policy that explicitly allows anon role
CREATE POLICY "Allow public insert"
ON public.paid_users
FOR INSERT
TO anon
WITH CHECK (true);