-- Grant INSERT permission to anon role
GRANT INSERT ON public.paid_users TO anon;

-- Also grant SELECT for checking existing users
GRANT SELECT ON public.paid_users TO anon;