-- ============================================================
-- 087 - Travar acesso de um cadastro pelo /admincentral
-- ------------------------------------------------------------
-- O administrador pode TRAVAR o acesso de um usuário informando
-- um motivo (ex.: pagamento). Enquanto travado, o CRM mostra um
-- popup em tela cheia que não pode ser fechado até o admin
-- destravar. Idempotente.
-- ============================================================

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS access_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS access_lock_reason text;

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS access_locked_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS crm_profiles_access_locked_idx
  ON public.crm_profiles (access_locked)
  WHERE access_locked = true;

GRANT SELECT ON public.crm_profiles TO authenticated;
GRANT ALL ON public.crm_profiles TO service_role;
