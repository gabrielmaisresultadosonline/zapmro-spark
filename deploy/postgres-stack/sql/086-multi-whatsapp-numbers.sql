-- ============================================================
-- 086 - Suporte a múltiplos números de WhatsApp por cadastro
-- ------------------------------------------------------------
-- O admin (/admincentral) libera quantos números um cadastro pode
-- conectar (crm_profiles.max_whatsapp_numbers) e pode definir uma
-- senha (PIN) por número. O usuário escolhe qual número abrir antes
-- de entrar nas conversas e pode trocar a qualquer momento.
-- Idempotente.
-- ============================================================

ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS max_whatsapp_numbers integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text,
  meta_access_token text,
  meta_phone_number_id text,
  meta_waba_id text,
  meta_business_id text,
  meta_app_id text,
  meta_app_secret text,
  meta_display_phone_number text,
  meta_verified_name text,
  access_pin text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_whatsapp_numbers_user_phone_key
  ON public.crm_whatsapp_numbers (user_id, meta_phone_number_id)
  WHERE meta_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_whatsapp_numbers_user_idx
  ON public.crm_whatsapp_numbers (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_whatsapp_numbers TO authenticated;
GRANT ALL ON public.crm_whatsapp_numbers TO service_role;

ALTER TABLE public.crm_whatsapp_numbers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_whatsapp_numbers'
      AND policyname = 'crm_whatsapp_numbers_owner'
  ) THEN
    CREATE POLICY crm_whatsapp_numbers_owner
      ON public.crm_whatsapp_numbers
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Importa a conexão atual de cada usuário como o primeiro número da lista.
INSERT INTO public.crm_whatsapp_numbers (
  user_id, label, meta_access_token, meta_phone_number_id, meta_waba_id,
  meta_business_id, meta_app_id, meta_app_secret,
  meta_display_phone_number, meta_verified_name, is_active
)
SELECT
  s.user_id,
  COALESCE(s.meta_verified_name, s.meta_display_phone_number, 'WhatsApp principal'),
  s.meta_access_token,
  s.meta_phone_number_id,
  s.meta_waba_id,
  s.meta_business_id,
  s.meta_app_id,
  s.meta_app_secret,
  s.meta_display_phone_number,
  s.meta_verified_name,
  true
FROM public.crm_settings s
WHERE s.user_id IS NOT NULL
  AND s.meta_phone_number_id IS NOT NULL
  AND s.meta_access_token IS NOT NULL
ON CONFLICT DO NOTHING;
