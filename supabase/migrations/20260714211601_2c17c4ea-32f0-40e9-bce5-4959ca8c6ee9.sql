
ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan TEXT;

-- Default 2-day trial for future inserts
ALTER TABLE public.crm_profiles
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '2 days');

-- Grant CRM access to a user by email (used by webhook + admin approval)
CREATE OR REPLACE FUNCTION public.grant_crm_access(
  p_email TEXT,
  p_plan TEXT,
  p_days INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.crm_profiles (user_id, is_paid, plan, access_until, trial_ends_at)
  VALUES (v_user_id, true, p_plan, now() + (p_days || ' days')::interval, now() + interval '2 days')
  ON CONFLICT (user_id) DO UPDATE SET
    is_paid = true,
    plan = EXCLUDED.plan,
    access_until = GREATEST(COALESCE(crm_profiles.access_until, now()), now()) + (p_days || ' days')::interval,
    updated_at = now();

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_crm_access(TEXT, TEXT, INTEGER) TO service_role;
