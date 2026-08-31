-- Create function to increment corrections count
CREATE OR REPLACE FUNCTION public.increment_corretor_corrections(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE corretor_users 
  SET corrections_count = COALESCE(corrections_count, 0) + 1
  WHERE id = p_user_id;
END;
$$;