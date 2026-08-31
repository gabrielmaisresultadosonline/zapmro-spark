ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS google_sync_claim_token uuid,
  ADD COLUMN IF NOT EXISTS google_sync_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_google_sync_pending_claim
  ON public.crm_contacts (user_id, google_sync_claimed_at)
  WHERE google_sync_account_id IS NULL OR metadata->>'google_dirty' = 'true';

CREATE OR REPLACE FUNCTION public.claim_crm_contacts_for_google_sync(
  p_user_id uuid,
  p_limit integer,
  p_claim_token uuid
)
RETURNS SETOF public.crm_contacts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT c.id
    FROM public.crm_contacts AS c
    WHERE c.user_id = p_user_id
      AND (
        c.google_sync_account_id IS NULL
        OR c.metadata->>'google_dirty' = 'true'
      )
      AND (
        c.google_sync_claimed_at IS NULL
        OR c.google_sync_claimed_at < now() - interval '10 minutes'
      )
    ORDER BY c.created_at ASC, c.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500)
  )
  UPDATE public.crm_contacts AS c
  SET google_sync_claim_token = p_claim_token,
      google_sync_claimed_at = now()
  FROM candidates
  WHERE c.id = candidates.id
  RETURNING c.*;
$$;

REVOKE ALL ON FUNCTION public.claim_crm_contacts_for_google_sync(uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_crm_contacts_for_google_sync(uuid, integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_crm_contacts_for_google_sync(uuid, integer, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_crm_contacts_for_google_sync(uuid, integer, uuid) TO service_role;