-- ============================================================
-- 085 - Garante uma configuração CRM por usuário
-- ------------------------------------------------------------
-- O Embedded Signup salva a conexão com ON CONFLICT (user_id).
-- Sem esta constraint o PostgreSQL rejeita a troca do código OAuth.
-- Idempotente e seguro para bases já migradas.
-- ============================================================

-- Mantém, para cada usuário, o registro com credenciais Meta mais completo e
-- recente. Registros sem usuário não participam da deduplicação.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        (meta_access_token IS NOT NULL)::int DESC,
        (meta_phone_number_id IS NOT NULL)::int DESC,
        (meta_waba_id IS NOT NULL)::int DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.crm_settings
  WHERE user_id IS NOT NULL
)
DELETE FROM public.crm_settings settings
USING ranked
WHERE settings.id = ranked.id
  AND ranked.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_settings'::regclass
      AND contype IN ('u', 'p')
      AND conkey = ARRAY[
        (SELECT attnum
         FROM pg_attribute
         WHERE attrelid = 'public.crm_settings'::regclass
           AND attname = 'user_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.crm_settings
      ADD CONSTRAINT crm_settings_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Os webhooks e a importação em massa usam ON CONFLICT (wa_id, user_id).
-- Antes de criar a chave composta, redireciona todo histórico dos contatos
-- duplicados para o contato mais ativo/recente da mesma conta.
CREATE TEMP TABLE IF NOT EXISTS crm_contact_duplicate_map (
  duplicate_id uuid PRIMARY KEY,
  keeper_id uuid NOT NULL
);

TRUNCATE crm_contact_duplicate_map;

INSERT INTO crm_contact_duplicate_map (duplicate_id, keeper_id)
SELECT id, keeper_id
FROM (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY wa_id, user_id
      ORDER BY
        last_interaction DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS keeper_id,
    ROW_NUMBER() OVER (
      PARTITION BY wa_id, user_id
      ORDER BY
        last_interaction DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.crm_contacts
  WHERE user_id IS NOT NULL
) ranked
WHERE rn > 1;

UPDATE public.crm_activities child
SET contact_id = duplicates.keeper_id
FROM crm_contact_duplicate_map duplicates
WHERE child.contact_id = duplicates.duplicate_id;

UPDATE public.crm_flow_executions child
SET contact_id = duplicates.keeper_id
FROM crm_contact_duplicate_map duplicates
WHERE child.contact_id = duplicates.duplicate_id;

UPDATE public.crm_messages child
SET contact_id = duplicates.keeper_id
FROM crm_contact_duplicate_map duplicates
WHERE child.contact_id = duplicates.duplicate_id;

UPDATE public.crm_scheduled_messages child
SET contact_id = duplicates.keeper_id
FROM crm_contact_duplicate_map duplicates
WHERE child.contact_id = duplicates.duplicate_id;

DELETE FROM public.crm_contacts contacts
USING crm_contact_duplicate_map duplicates
WHERE contacts.id = duplicates.duplicate_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_contacts'::regclass
      AND contype IN ('u', 'p')
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.crm_contacts'::regclass AND attname = 'wa_id'),
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.crm_contacts'::regclass AND attname = 'user_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.crm_contacts
      ADD CONSTRAINT crm_contacts_wa_id_user_id_key UNIQUE (wa_id, user_id);
  END IF;
END $$;
