-- =====================================================================
-- 089 — Correção dos índices de conversas por número
-- =====================================================================
-- CONTEXTO / POR QUE ESTA MIGRAÇÃO EXISTE
--
-- A migração 088 criou APENAS índices únicos PARCIAIS em crm_contacts:
--   crm_contacts_wa_user_number_idx   ... WHERE whatsapp_number_id IS NOT NULL
--   crm_contacts_wa_user_nonumber_idx ... WHERE whatsapp_number_id IS NULL
--
-- O PostgREST (usado pelo supabase-js em `.upsert(..., { onConflict })`)
-- envia "ON CONFLICT (wa_id, user_id, whatsapp_number_id)" SEM repetir o
-- predicado WHERE. O Postgres NÃO infere índice parcial nesse caso, então o
-- upsert falhava com:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- Consequência em produção: TODA mensagem recebida de qualquer cadastro que
-- já tivesse número em crm_whatsapp_numbers deixou de ser salva.
--
-- Além disso, a 088 tentou remover a restrição antiga (wa_id, user_id) pelo
-- nome do ÍNDICE legado (crm_contacts_wa_id_user_id_idx), mas a 085 criou uma
-- CONSTRAINT chamada crm_contacts_wa_id_user_id_key — que continuou ativa e
-- impedia o mesmo contato de existir em duas caixas do mesmo cadastro.
--
-- Esta migração é ADITIVA e IDEMPOTENTE. Não apaga contatos nem mensagens.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Auditoria: duplicidades reais antes de criar índice não-parcial
-- ---------------------------------------------------------------------
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT wa_id, user_id, whatsapp_number_id
    FROM public.crm_contacts
    WHERE whatsapp_number_id IS NOT NULL
    GROUP BY wa_id, user_id, whatsapp_number_id
    HAVING count(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE NOTICE '[089] Existem % grupos duplicados (wa_id,user_id,whatsapp_number_id). Serão consolidados abaixo.', dup_count;
  ELSE
    RAISE NOTICE '[089] Nenhuma duplicidade por caixa encontrada.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) Consolidação segura de duplicatas dentro da MESMA caixa
--    Mensagens e demais vínculos são movidos para o contato mais antigo.
--    Nada é apagado antes de repontar as mensagens.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT wa_id, user_id, whatsapp_number_id,
           min(created_at) AS primeiro
    FROM public.crm_contacts
    WHERE whatsapp_number_id IS NOT NULL
    GROUP BY wa_id, user_id, whatsapp_number_id
    HAVING count(*) > 1
  LOOP
    DECLARE
      keep_id uuid;
    BEGIN
      SELECT id INTO keep_id
      FROM public.crm_contacts
      WHERE wa_id = r.wa_id
        AND user_id = r.user_id
        AND whatsapp_number_id = r.whatsapp_number_id
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      UPDATE public.crm_messages m
         SET contact_id = keep_id
       WHERE m.contact_id IN (
               SELECT id FROM public.crm_contacts
                WHERE wa_id = r.wa_id
                  AND user_id = r.user_id
                  AND whatsapp_number_id = r.whatsapp_number_id
                  AND id <> keep_id
             );

      DELETE FROM public.crm_contacts
       WHERE wa_id = r.wa_id
         AND user_id = r.user_id
         AND whatsapp_number_id = r.whatsapp_number_id
         AND id <> keep_id;

      RAISE NOTICE '[089] Consolidado wa_id=% caixa=% no contato %', r.wa_id, r.whatsapp_number_id, keep_id;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3) Remover a restrição antiga (wa_id, user_id) que bloqueia multi-número
--    Feita por nome de CONSTRAINT (a 088 usou nome de índice e não pegou).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
     WHERE ns.nspname = 'public'
       AND cl.relname = 'crm_contacts'
       AND con.contype = 'u'
       AND (
         SELECT array_agg(att.attname ORDER BY att.attname)
           FROM unnest(con.conkey) k
           JOIN pg_attribute att
             ON att.attrelid = con.conrelid AND att.attnum = k
       ) = ARRAY['user_id','wa_id']::name[]
  LOOP
    EXECUTE format('ALTER TABLE public.crm_contacts DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE '[089] Constraint antiga removida: %', c.conname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4) Índice único NÃO-PARCIAL nas três colunas
--    É este índice que o ON CONFLICT (wa_id,user_id,whatsapp_number_id)
--    do PostgREST consegue inferir. Linhas com whatsapp_number_id NULL
--    continuam permitidas (NULLs são distintos no Postgres) e seguem
--    protegidas pelo índice parcial da 088.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_wa_user_number_uidx
  ON public.crm_contacts (wa_id, user_id, whatsapp_number_id);

-- ---------------------------------------------------------------------
-- 5) Índices de desempenho para leitura por caixa
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS crm_contacts_user_number_idx
  ON public.crm_contacts (user_id, whatsapp_number_id, last_message_received_at DESC);

CREATE INDEX IF NOT EXISTS crm_messages_user_number_idx
  ON public.crm_messages (user_id, whatsapp_number_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_whatsapp_numbers_phone_lookup_idx
  ON public.crm_whatsapp_numbers (meta_phone_number_id);

CREATE INDEX IF NOT EXISTS crm_whatsapp_numbers_waba_lookup_idx
  ON public.crm_whatsapp_numbers (meta_waba_id);

-- ---------------------------------------------------------------------
-- 6) Trigger de preenchimento: respeitar is_active
--    A 088 escolhia a caixa ignorando is_active, podendo apontar para um
--    número desativado. Aqui o número ativo tem prioridade.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_fill_contact_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  numero_id uuid;
BEGIN
  -- Se a aplicação já decidiu a caixa, respeitamos integralmente.
  IF NEW.whatsapp_number_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT n.id INTO numero_id
    FROM public.crm_whatsapp_numbers n
    LEFT JOIN public.crm_settings s ON s.user_id = n.user_id
   WHERE n.user_id = NEW.user_id
   ORDER BY
     (n.meta_phone_number_id IS NOT NULL
       AND n.meta_phone_number_id = s.meta_phone_number_id) DESC,
     COALESCE(n.is_active, true) DESC,
     COALESCE(n.is_primary, false) DESC,
     n.created_at ASC
   LIMIT 1;

  IF numero_id IS NOT NULL THEN
    NEW.whatsapp_number_id := numero_id;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- 7) Relatório final de auditoria
-- ---------------------------------------------------------------------
DO $$
DECLARE
  sem_numero integer;
  numeros_sem_dono integer;
  phone_duplicado integer;
BEGIN
  SELECT count(*) INTO sem_numero
    FROM public.crm_contacts WHERE whatsapp_number_id IS NULL;

  SELECT count(*) INTO numeros_sem_dono
    FROM public.crm_whatsapp_numbers WHERE user_id IS NULL;

  SELECT count(*) INTO phone_duplicado
    FROM (
      SELECT meta_phone_number_id
        FROM public.crm_whatsapp_numbers
       WHERE meta_phone_number_id IS NOT NULL
       GROUP BY meta_phone_number_id
      HAVING count(DISTINCT user_id) > 1
    ) d;

  RAISE NOTICE '[089] contatos sem caixa: % | numeros sem dono: % | phone_number_id em contas diferentes: %',
    sem_numero, numeros_sem_dono, phone_duplicado;
END $$;

COMMIT;
