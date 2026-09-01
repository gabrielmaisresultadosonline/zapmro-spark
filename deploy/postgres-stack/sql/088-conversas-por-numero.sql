-- ============================================================
-- 088 - Conversas separadas por número de WhatsApp
-- ------------------------------------------------------------
-- Cada número de `crm_whatsapp_numbers` passa a ter contatos,
-- mensagens e disparos próprios. Nada é apagado: as linhas
-- existentes são vinculadas ao número ativo de hoje.
-- Idempotente.
-- ============================================================

-- 1) Colunas de escopo -----------------------------------------------------
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS whatsapp_number_id uuid;

ALTER TABLE public.crm_messages
  ADD COLUMN IF NOT EXISTS whatsapp_number_id uuid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'crm_webhooks') THEN
    EXECUTE 'ALTER TABLE public.crm_webhooks ADD COLUMN IF NOT EXISTS whatsapp_number_id uuid';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'crm_broadcasts') THEN
    EXECUTE 'ALTER TABLE public.crm_broadcasts ADD COLUMN IF NOT EXISTS whatsapp_number_id uuid';
  END IF;
END $$;

-- 2) Backfill: tudo que existe hoje pertence ao número atualmente ativo ----
WITH ativo AS (
  SELECT DISTINCT ON (n.user_id)
         n.user_id,
         n.id AS number_id
  FROM public.crm_whatsapp_numbers n
  LEFT JOIN public.crm_settings s ON s.user_id = n.user_id
  ORDER BY n.user_id,
           (s.meta_phone_number_id IS NOT NULL
            AND n.meta_phone_number_id = s.meta_phone_number_id) DESC,
           n.created_at ASC
)
UPDATE public.crm_contacts c
SET whatsapp_number_id = a.number_id
FROM ativo a
WHERE c.user_id = a.user_id
  AND c.whatsapp_number_id IS NULL;

UPDATE public.crm_messages m
SET whatsapp_number_id = c.whatsapp_number_id
FROM public.crm_contacts c
WHERE m.contact_id = c.id
  AND m.whatsapp_number_id IS NULL
  AND c.whatsapp_number_id IS NOT NULL;

-- 3) Índices --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS crm_contacts_number_idx
  ON public.crm_contacts (user_id, whatsapp_number_id);

CREATE INDEX IF NOT EXISTS crm_messages_number_idx
  ON public.crm_messages (user_id, whatsapp_number_id);

-- Unicidade por (wa_id, user_id, número): o mesmo cliente pode existir em
-- caixas diferentes do mesmo cadastro. Mantemos um índice para linhas ainda
-- sem número definido, preservando o comportamento antigo nesse caso.
DROP INDEX IF EXISTS public.crm_contacts_wa_id_user_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_wa_user_number_idx
  ON public.crm_contacts (wa_id, user_id, whatsapp_number_id)
  WHERE whatsapp_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_wa_user_nonumber_idx
  ON public.crm_contacts (wa_id, user_id)
  WHERE whatsapp_number_id IS NULL;

-- 4) Chaves estrangeiras (best effort, sem travar a migração) -------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_contacts_whatsapp_number_fk'
  ) THEN
    ALTER TABLE public.crm_contacts
      ADD CONSTRAINT crm_contacts_whatsapp_number_fk
      FOREIGN KEY (whatsapp_number_id)
      REFERENCES public.crm_whatsapp_numbers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'FK crm_contacts_whatsapp_number_fk ignorada: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_messages_whatsapp_number_fk'
  ) THEN
    ALTER TABLE public.crm_messages
      ADD CONSTRAINT crm_messages_whatsapp_number_fk
      FOREIGN KEY (whatsapp_number_id)
      REFERENCES public.crm_whatsapp_numbers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'FK crm_messages_whatsapp_number_fk ignorada: %', SQLERRM;
END $$;

-- 5) Preenchimento automático (garante que nada fique sem número) ---------
CREATE OR REPLACE FUNCTION public.crm_fill_contact_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.whatsapp_number_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT n.id INTO NEW.whatsapp_number_id
    FROM public.crm_whatsapp_numbers n
    LEFT JOIN public.crm_settings s ON s.user_id = n.user_id
    WHERE n.user_id = NEW.user_id
    ORDER BY (s.meta_phone_number_id IS NOT NULL
              AND n.meta_phone_number_id = s.meta_phone_number_id) DESC,
             n.created_at ASC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_contacts_fill_number ON public.crm_contacts;
CREATE TRIGGER crm_contacts_fill_number
  BEFORE INSERT ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_fill_contact_number();

CREATE OR REPLACE FUNCTION public.crm_fill_message_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.whatsapp_number_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT c.whatsapp_number_id INTO NEW.whatsapp_number_id
    FROM public.crm_contacts c
    WHERE c.id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_messages_fill_number ON public.crm_messages;
CREATE TRIGGER crm_messages_fill_number
  BEFORE INSERT ON public.crm_messages
  FOR EACH ROW EXECUTE FUNCTION public.crm_fill_message_number();
