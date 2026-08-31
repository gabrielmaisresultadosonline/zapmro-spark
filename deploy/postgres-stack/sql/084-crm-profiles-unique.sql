-- ============================================================
-- 084 - Restaura a UNIQUE(user_id) em public.crm_profiles
-- ------------------------------------------------------------
-- Motivo: grant_crm_access / cancel_access usam
--   INSERT ... ON CONFLICT (user_id)  /  upsert onConflict: "user_id"
-- Sem a constraint o Postgres devolve:
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
-- e a ativação manual do plano no /admincentral falha.
-- Idempotente: pode rodar quantas vezes precisar.
-- ============================================================

-- 1) Remove duplicados mantendo o registro mais completo/recente
WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        (is_paid)::int DESC,
        access_until DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.crm_profiles
)
DELETE FROM public.crm_profiles p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2) Cria a constraint única (só se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_profiles'::regclass
      AND contype IN ('u', 'p')
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.crm_profiles'::regclass
            AND attname = 'user_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.crm_profiles
      ADD CONSTRAINT crm_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;
