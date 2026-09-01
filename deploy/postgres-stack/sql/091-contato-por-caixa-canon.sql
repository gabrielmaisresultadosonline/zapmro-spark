-- =====================================================================
-- 091 — Contato único POR CAIXA (corrige crm_contacts_user_canon_wa_id_key)
-- =====================================================================
-- SINTOMA EM PRODUÇÃO
--   [WEBHOOK] Failed to resolve contact creation
--     duplicate key value violates unique constraint
--     "crm_contacts_user_canon_wa_id_key"
--   -> a mensagem recebida era descartada com HTTP 500 e nada aparecia no CRM.
--
-- CAUSA RAIZ
--   A 070 criou:
--     CREATE UNIQUE INDEX crm_contacts_user_canon_wa_id_key
--       ON public.crm_contacts (user_id, crm_canon_wa_id(wa_id));
--   Ou seja: um mesmo contato só podia existir UMA vez por CADASTRO,
--   independentemente da caixa de WhatsApp.
--
--   A 089 removeu apenas constraints cujas colunas eram exatamente
--   (user_id, wa_id). Este índice é sobre uma EXPRESSÃO
--   (crm_canon_wa_id(wa_id)), então sobreviveu — e passou a ser o bloqueio
--   real do multi-número: quando o mesmo contato escreve para a segunda
--   caixa do mesmo cadastro, o INSERT viola este índice.
--
--   Era exatamente o caso do cadastro com dois números: um número recebia
--   normalmente (o contato já era dele) e o outro nunca conseguia criar o
--   contato.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--   1) consolida duplicatas reais dentro da MESMA caixa (nada é perdido:
--      as mensagens são repontadas antes de qualquer DELETE);
--   2) remove os índices/constraints únicos sobre
--      (user_id, crm_canon_wa_id(wa_id)) que ignoram a caixa;
--   3) recria a unicidade incluindo whatsapp_number_id.
--
-- ADITIVA e IDEMPOTENTE. Não apaga mensagens.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Auditoria antes de mexer
-- ---------------------------------------------------------------------
DO $$
DECLARE
  dup_caixa integer;
  dup_cadastro integer;
BEGIN
  SELECT count(*) INTO dup_caixa FROM (
    SELECT user_id, public.crm_canon_wa_id(wa_id) AS canon, whatsapp_number_id
      FROM public.crm_contacts
     GROUP BY 1, 2, 3
    HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO dup_cadastro FROM (
    SELECT user_id, public.crm_canon_wa_id(wa_id) AS canon
      FROM public.crm_contacts
     GROUP BY 1, 2
    HAVING count(DISTINCT whatsapp_number_id) > 1
  ) d;

  RAISE NOTICE '[091] duplicatas na MESMA caixa: % | contatos legitimamente em 2+ caixas: %',
    dup_caixa, dup_cadastro;
END $$;

-- ---------------------------------------------------------------------
-- 2) Consolidação segura dentro da MESMA caixa
--    (mesmo canon_wa_id + mesmo user_id + mesma caixa = duplicata real)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  keep_id uuid;
BEGIN
  FOR r IN
    SELECT user_id,
           public.crm_canon_wa_id(wa_id) AS canon,
           whatsapp_number_id
      FROM public.crm_contacts
     GROUP BY 1, 2, 3
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keep_id
      FROM public.crm_contacts
     WHERE user_id = r.user_id
       AND public.crm_canon_wa_id(wa_id) = r.canon
       AND whatsapp_number_id IS NOT DISTINCT FROM r.whatsapp_number_id
     ORDER BY created_at ASC, id ASC
     LIMIT 1;

    -- mensagens primeiro: nada é apagado antes de ser repontado
    UPDATE public.crm_messages m
       SET contact_id = keep_id
     WHERE m.contact_id IN (
             SELECT id FROM public.crm_contacts
              WHERE user_id = r.user_id
                AND public.crm_canon_wa_id(wa_id) = r.canon
                AND whatsapp_number_id IS NOT DISTINCT FROM r.whatsapp_number_id
                AND id <> keep_id
           );

    DELETE FROM public.crm_contacts
     WHERE user_id = r.user_id
       AND public.crm_canon_wa_id(wa_id) = r.canon
       AND whatsapp_number_id IS NOT DISTINCT FROM r.whatsapp_number_id
       AND id <> keep_id;

    RAISE NOTICE '[091] consolidado canon=% caixa=% no contato %',
      r.canon, r.whatsapp_number_id, keep_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3) Remover a unicidade por CADASTRO (sem caixa) — o bloqueio real
--    Percorre constraints e índices únicos cuja definição usa
--    crm_canon_wa_id(wa_id) e NÃO menciona whatsapp_number_id.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  -- 3a) constraints únicas baseadas nesses índices
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_class idx ON idx.oid = con.conindid
     WHERE ns.nspname = 'public'
       AND cl.relname = 'crm_contacts'
       AND con.contype = 'u'
       AND pg_get_indexdef(idx.oid) LIKE '%crm_canon_wa_id%'
       AND pg_get_indexdef(idx.oid) NOT LIKE '%whatsapp_number_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.crm_contacts DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE '[091] constraint removida: %', c.conname;
  END LOOP;

  -- 3b) índices únicos soltos (é o caso do crm_contacts_user_canon_wa_id_key)
  FOR c IN
    SELECT cl.relname
      FROM pg_index i
      JOIN pg_class cl ON cl.oid = i.indexrelid
      JOIN pg_class tb ON tb.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = tb.relnamespace
     WHERE ns.nspname = 'public'
       AND tb.relname = 'crm_contacts'
       AND i.indisunique
       AND pg_get_indexdef(i.indexrelid) LIKE '%crm_canon_wa_id%'
       AND pg_get_indexdef(i.indexrelid) NOT LIKE '%whatsapp_number_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', c.relname);
    RAISE NOTICE '[091] índice único removido: %', c.relname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4) Recriar a unicidade JÁ POR CAIXA
--    Duas variantes parciais para tratar NULL (NULLs são distintos no
--    Postgres, então a versão NOT NULL não protegeria as linhas legadas).
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_user_canon_number_uidx
  ON public.crm_contacts (user_id, public.crm_canon_wa_id(wa_id), whatsapp_number_id)
  WHERE whatsapp_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_user_canon_nonumber_uidx
  ON public.crm_contacts (user_id, public.crm_canon_wa_id(wa_id))
  WHERE whatsapp_number_id IS NULL;

-- ---------------------------------------------------------------------
-- 5) Relatório final
-- ---------------------------------------------------------------------
DO $$
DECLARE
  restantes integer;
BEGIN
  SELECT count(*) INTO restantes
    FROM pg_index i
    JOIN pg_class cl ON cl.oid = i.indexrelid
    JOIN pg_class tb ON tb.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tb.relnamespace
   WHERE ns.nspname = 'public'
     AND tb.relname = 'crm_contacts'
     AND i.indisunique
     AND pg_get_indexdef(i.indexrelid) LIKE '%crm_canon_wa_id%'
     AND pg_get_indexdef(i.indexrelid) NOT LIKE '%whatsapp_number_id%';

  IF restantes > 0 THEN
    RAISE WARNING '[091] ainda existem % índice(s) únicos ignorando a caixa', restantes;
  ELSE
    RAISE NOTICE '[091] OK — unicidade de contato agora é por (cadastro, contato, caixa)';
  END IF;
END $$;

COMMIT;
