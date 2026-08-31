-- Grant SELECT to anon role
GRANT SELECT ON public.paid_users TO anon;

-- Update existing users to have empty password (will be fixed on next registration)
-- For now, we'll handle this in the login edge function