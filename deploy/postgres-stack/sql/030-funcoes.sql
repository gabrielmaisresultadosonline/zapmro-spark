-- ============================================================
-- ZAPMRO — 3. FUNCOES POSTGRESQL
-- Gerado em: 2026-08-29T14:18:03.232Z
-- ============================================================
BEGIN;
SET session_replication_role = replica;

CREATE OR REPLACE FUNCTION public.admin_count_auth_users()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*) FROM auth.users;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_auth_identities(p_offset integer DEFAULT 0, p_limit integer DEFAULT 500)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE col_list text; col_arr text[]; q text; res text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         array_agg(column_name::text ORDER BY ordinal_position)
  INTO col_list, col_arr
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'identities';

  IF col_list IS NULL THEN RETURN ''; END IF;

  q := format(
    'SELECT coalesce(string_agg(stmt, E''\n''), '''') FROM (
       SELECT ''INSERT INTO auth.identities ('' || %L || '') VALUES ('' ||
         (SELECT string_agg(
            CASE WHEN (to_jsonb(t) ->> u.c) IS NULL THEN ''NULL''
                 ELSE quote_literal(to_jsonb(t) ->> u.c) END, '', '' ORDER BY u.ord)
          FROM unnest(%L::text[]) WITH ORDINALITY AS u(c, ord))
         || '') ON CONFLICT DO NOTHING;'' AS stmt
       FROM auth.identities t
       OFFSET %s LIMIT %s
     ) s',
    col_list, col_arr, greatest(coalesce(p_offset,0),0), least(greatest(coalesce(p_limit,500),1),5000)
  );
  EXECUTE q INTO res;
  RETURN coalesce(res, '');
END; $function$


CREATE OR REPLACE FUNCTION public.admin_dump_auth_users(p_offset integer DEFAULT 0, p_limit integer DEFAULT 500)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE col_list text; col_arr text[]; q text; res text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         array_agg(column_name::text ORDER BY ordinal_position)
  INTO col_list, col_arr
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'users';

  IF col_list IS NULL THEN RETURN ''; END IF;

  q := format(
    'SELECT coalesce(string_agg(stmt, E''\n''), '''') FROM (
       SELECT ''INSERT INTO auth.users ('' || %L || '') VALUES ('' ||
         (SELECT string_agg(
            CASE WHEN (to_jsonb(t) ->> u.c) IS NULL THEN ''NULL''
                 ELSE quote_literal(to_jsonb(t) ->> u.c) END, '', '' ORDER BY u.ord)
          FROM unnest(%L::text[]) WITH ORDINALITY AS u(c, ord))
         || '') ON CONFLICT (id) DO NOTHING;'' AS stmt
       FROM auth.users t
       ORDER BY t.created_at
       OFFSET %s LIMIT %s
     ) s',
    col_list, col_arr, greatest(coalesce(p_offset,0),0), least(greatest(coalesce(p_limit,500),1),5000)
  );
  EXECUTE q INTO res;
  RETURN coalesce(res, '');
END; $function$


CREATE OR REPLACE FUNCTION public.admin_dump_cron()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; out_sql text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RETURN '-- pg_cron nao instalado';
  END IF;
  FOR r IN EXECUTE 'SELECT jobname, schedule, command FROM cron.job ORDER BY jobid' LOOP
    out_sql := out_sql || format('SELECT cron.schedule(%L, %L, %L);', r.jobname, r.schedule, r.command) || E'\n';
  END LOOP;
  RETURN out_sql;
END; $function$


CREATE OR REPLACE FUNCTION public.admin_dump_extensions()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; out_sql text := '';
BEGIN
  FOR r IN
    SELECT e.extname, n.nspname
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname NOT IN ('plpgsql')
    ORDER BY e.extname
  LOOP
    out_sql := out_sql || format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', r.extname, r.nspname) || E'\n';
  END LOOP;
  RETURN out_sql;
END; $function$


CREATE OR REPLACE FUNCTION public.admin_dump_fks()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
BEGIN
  FOR r IN
    SELECT con.conname AS cname,
           c.relname AS tbl,
           pg_get_constraintdef(con.oid) AS cdef
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND con.contype = 'f'
    ORDER BY c.relname, con.conname
  LOOP
    out_sql := out_sql || format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
      r.tbl, r.cname, r.cdef
    ) || E'\n';
  END LOOP;
  RETURN out_sql;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_functions()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
BEGIN
  FOR r IN
    SELECT p.proname AS fname,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS fres,
           pg_get_functiondef(p.oid) AS fdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
    ORDER BY p.proname
  LOOP
    out_sql := out_sql || r.fdef || E'\n\n';
  END LOOP;
  RETURN out_sql;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_grants()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
BEGIN
  FOR r IN
    SELECT DISTINCT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
    ORDER BY table_name, grantee, privilege_type
  LOOP
    out_sql := out_sql || format(
      'GRANT %s ON public.%I TO %I;',
      r.privilege_type, r.table_name, r.grantee
    ) || E'\n';
  END LOOP;
  RETURN out_sql;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_indexes()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
BEGIN
  FOR r IN
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT IN (
        SELECT conname FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND con.contype IN ('p','u')
      )
    ORDER BY tablename, indexname
  LOOP
    out_sql := out_sql || r.indexdef || E';\n';
  END LOOP;
  RETURN out_sql;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_policies()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
  roles text;
BEGIN
  -- Enable RLS flags
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    out_sql := out_sql || format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tbl) || E'\n';
  END LOOP;
  out_sql := out_sql || E'\n';

  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    SELECT string_agg(quote_literal(x), ', ') INTO roles FROM unnest(r.roles) AS x;
    out_sql := out_sql || format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
      r.policyname, r.tablename, r.permissive, r.cmd,
      COALESCE(roles, 'PUBLIC'),
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END
    ) || E'\n';
  END LOOP;
  RETURN out_sql;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_schema()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
  cols text;
  pk text;
BEGIN
  FOR r IN
    SELECT t.table_name AS tname
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  LOOP
    SELECT string_agg(
      format('  %I %s%s%s',
        c.column_name,
        c.data_type ||
          CASE WHEN c.data_type IN ('character varying','character') AND c.character_maximum_length IS NOT NULL
               THEN '(' || c.character_maximum_length || ')' ELSE '' END,
        CASE WHEN c.column_default IS NOT NULL THEN ' DEFAULT ' || c.column_default ELSE '' END,
        CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
      ), E',\n' ORDER BY c.ordinal_position)
    INTO cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = r.tname;

    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY x.ord)
    INTO pk
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.attnum
    WHERE con.conrelid = format('public.%I', r.tname)::regclass AND con.contype = 'p';

    out_sql := out_sql || format(E'CREATE TABLE IF NOT EXISTS public.%I (\n%s%s\n);\n\n',
      r.tname,
      cols,
      CASE WHEN pk IS NOT NULL THEN E',\n  PRIMARY KEY (' || pk || ')' ELSE '' END);
  END LOOP;

  RETURN out_sql;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_sequences()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; out_sql text := ''; lastval bigint;
BEGIN
  FOR r IN
    SELECT c.relname AS seqname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
    ORDER BY c.relname
  LOOP
    out_sql := out_sql || format('CREATE SEQUENCE IF NOT EXISTS public.%I;', r.seqname) || E'\n';
    BEGIN
      EXECUTE format('SELECT last_value FROM public.%I', r.seqname) INTO lastval;
      out_sql := out_sql || format('SELECT setval(%L, %s, true);', 'public.' || r.seqname, coalesce(lastval, 1)) || E'\n';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN out_sql;
END; $function$


CREATE OR REPLACE FUNCTION public.admin_dump_storage(p_offset integer DEFAULT 0, p_limit integer DEFAULT 2000)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; out_sql text := ''; stmt_head text;
BEGIN
  stmt_head := 'INSERT ' || 'INTO ' || 'storage.buckets (id, name, public) VALUES (';
  IF coalesce(p_offset,0) = 0 THEN
    FOR r IN EXECUTE 'SELECT id, name, public FROM storage.buckets ORDER BY name' LOOP
      out_sql := out_sql || stmt_head || quote_literal(r.id) || ', ' || quote_literal(r.name) || ', ' ||
        quote_literal(r.public::text) || ') ON CONFLICT (id) DO NOTHING;' || E'\n';
    END LOOP;
    out_sql := out_sql || E'\n-- Inventario de arquivos (copiar binarios via API de storage):\n';
  END IF;

  FOR r IN EXECUTE format(
    'SELECT bucket_id, name FROM storage.objects ORDER BY bucket_id, name OFFSET %s LIMIT %s',
    greatest(coalesce(p_offset,0),0), least(greatest(coalesce(p_limit,2000),1),5000))
  LOOP
    out_sql := out_sql || format('-- FILE %s/%s', r.bucket_id, r.name) || E'\n';
  END LOOP;
  RETURN out_sql;
END; $function$


CREATE OR REPLACE FUNCTION public.admin_dump_table_rows(p_table text, p_offset integer, p_limit integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  col_list text;
  col_arr text[];
  q text;
  res text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = p_table
  ) THEN
    RETURN '';
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         array_agg(column_name::text ORDER BY ordinal_position)
  INTO col_list, col_arr
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  IF col_list IS NULL THEN RETURN ''; END IF;

  q := format(
    'SELECT coalesce(string_agg(stmt, E''\n''), '''') FROM (
       SELECT ''INSERT INTO public.%I ('' || %L || '') VALUES ('' ||
         (SELECT string_agg(
            CASE WHEN (to_jsonb(t) ->> u.c) IS NULL THEN ''NULL''
                 ELSE quote_literal(to_jsonb(t) ->> u.c) END, '', '' ORDER BY u.ord)
          FROM unnest(%L::text[]) WITH ORDINALITY AS u(c, ord))
         || '') ON CONFLICT DO NOTHING;'' AS stmt
       FROM public.%I t
       ORDER BY 1
       OFFSET %s LIMIT %s
     ) s',
    p_table, col_list, col_arr, p_table, greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 500), 1), 5000)
  );

  EXECUTE q INTO res;
  RETURN coalesce(res, '');
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_triggers()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
BEGIN
  FOR r IN
    SELECT tg.tgname AS tname,
           c.relname AS tbl,
           pg_get_triggerdef(tg.oid) AS tdef
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT tg.tgisinternal
    ORDER BY c.relname, tg.tgname
  LOOP
    out_sql := out_sql || format('DROP TRIGGER IF EXISTS %I ON public.%I;', r.tname, r.tbl)
               || E'\n' || r.tdef || E';\n\n';
  END LOOP;
  RETURN out_sql;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_dump_types()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; out_sql text := ''; labels text; atts text;
BEGIN
  FOR r IN
    SELECT t.oid, t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
    ORDER BY t.typname
  LOOP
    SELECT string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
    INTO labels FROM pg_enum e WHERE e.enumtypid = r.oid;
    out_sql := out_sql || format(
      E'DO $do$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=''public'' AND t.typname=%L) THEN\n    CREATE TYPE public.%I AS ENUM (%s);\n  END IF;\nEND $do$;\n',
      r.typname, r.typname, coalesce(labels, '')
    );
  END LOOP;

  FOR r IN
    SELECT t.typname, pg_catalog.format_type(t.typbasetype, t.typtypmod) AS basetype
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'd'
    ORDER BY t.typname
  LOOP
    out_sql := out_sql || format('CREATE DOMAIN public.%I AS %s;', r.typname, r.basetype) || E'\n';
  END LOOP;

  FOR r IN
    SELECT t.oid, t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_class c ON c.oid = t.typrelid
    WHERE n.nspname = 'public' AND t.typtype = 'c' AND c.relkind = 'c'
    ORDER BY t.typname
  LOOP
    SELECT string_agg(format('%I %s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY a.attnum)
    INTO atts
    FROM pg_attribute a
    WHERE a.attrelid = (SELECT typrelid FROM pg_type WHERE oid = r.oid) AND a.attnum > 0 AND NOT a.attisdropped;
    out_sql := out_sql || format('CREATE TYPE public.%I AS (%s);', r.typname, coalesce(atts,'')) || E'\n';
  END LOOP;

  RETURN out_sql;
END; $function$


CREATE OR REPLACE FUNCTION public.admin_dump_views()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; out_sql text := '';
BEGIN
  FOR r IN SELECT viewname, definition FROM pg_views WHERE schemaname = 'public' ORDER BY viewname LOOP
    out_sql := out_sql || format('CREATE OR REPLACE VIEW public.%I AS %s', r.viewname, r.definition) || E'\n';
  END LOOP;
  FOR r IN SELECT matviewname AS viewname, definition FROM pg_matviews WHERE schemaname = 'public' ORDER BY matviewname LOOP
    out_sql := out_sql || format(E'DROP MATERIALIZED VIEW IF EXISTS public.%I;\nCREATE MATERIALIZED VIEW public.%I AS %s', r.viewname, r.viewname, r.definition) || E'\n';
  END LOOP;
  RETURN out_sql;
END; $function$


CREATE OR REPLACE FUNCTION public.admin_list_public_tables()
 RETURNS TABLE(table_name text, row_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  c bigint;
BEGIN
  FOR r IN
    SELECT t.table_name AS tname
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tname) INTO c;
    table_name := r.tname;
    row_count := c;
    RETURN NEXT;
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.claim_crm_contacts_for_google_sync(p_user_id uuid, p_limit integer, p_claim_token uuid)
 RETURNS SETOF crm_contacts
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.crm_canon_wa_id(_wa_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN _wa_id IS NULL THEN NULL
    WHEN _wa_id ~ '^55[0-9]{10}$'
      THEN substring(_wa_id, 1, 4) || '9' || substring(_wa_id, 5)
    ELSE _wa_id
  END
$function$


CREATE OR REPLACE FUNCTION public.crm_is_super_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.crm_profiles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$function$


CREATE OR REPLACE FUNCTION public.get_whatsapp_public_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  settings_row public.whatsapp_page_settings%ROWTYPE;
BEGIN
  SELECT *
  INTO settings_row
  FROM public.whatsapp_page_settings
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'whatsapp_number', COALESCE(settings_row.whatsapp_number, ''),
    'page_title', COALESCE(settings_row.page_title, 'Gabriel está disponível agora para te ajudar'),
    'page_subtitle', COALESCE(settings_row.page_subtitle, 'Sobre o que gostaria de falar clique no botão abaixo.'),
    'button_text', COALESCE(settings_row.button_text, 'FALAR NO WHATSAPP'),
    'whatsapp_message', COALESCE(settings_row.whatsapp_message, 'Olá, vim pelo site, gostaria de saber sobre o sistema inovador!'),
    'options', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'message', o.message,
          'icon_type', o.icon_type,
          'color', o.color,
          'order_index', o.order_index
        )
        ORDER BY o.order_index ASC, o.created_at ASC
      )
      FROM public.whatsapp_page_options o
      WHERE o.is_active = true
    ), '[]'::jsonb)
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.grant_crm_access(p_email text, p_plan text, p_days integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.handle_mro_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$


CREATE OR REPLACE FUNCTION public.increment_broadcast_failed(b_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.crm_broadcasts
  SET failed_count = COALESCE(failed_count, 0) + 1
  WHERE id = b_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.increment_broadcast_sent(b_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.crm_broadcasts
  SET sent_count = COALESCE(sent_count, 0) + 1
  WHERE id = b_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.increment_corretor_corrections(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE corretor_users 
  SET corrections_count = COALESCE(corrections_count, 0) + 1
  WHERE id = p_user_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.increment_crm_metric(metric_column text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    EXECUTE format('INSERT INTO public.crm_metrics (date, %I) 
                    VALUES (CURRENT_DATE, 1) 
                    ON CONFLICT (date) 
                    DO UPDATE SET %I = crm_metrics.%I + 1', metric_column, metric_column, metric_column);
END;
$function$


CREATE OR REPLACE FUNCTION public.trigger_process_scheduled_messages()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  api_url text;
  service_role_key text;
BEGIN
  -- Get the Supabase URL and Service Role Key from vault or settings
  -- Note: In a real environment, you'd use vault, but here we'll use the env vars
  -- if we can, or just hardcode the project-specific URL for now.
  -- The service role key is sensitive, but this function runs internally.
  
  -- We'll use a direct call to the edge function
  PERFORM net.http_post(
    url := coalesce(current_setting('app.settings.functions_url', true), 'http://gateway') || '/functions/v1/meta-whatsapp-crm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('action', 'processScheduled')
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.update_ads_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_corretor_orders_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_corretor_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_created_accesses_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_crm_flow_execution_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_inteligencia_fotos_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_metodo_seguidor_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_paid_users_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_payment_orders_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_promo33_users_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_prompts_mro_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_user_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_zapmro_users_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.whatsapp_admin_login(login_email text, login_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  settings_row public.whatsapp_page_settings%ROWTYPE;
  normalized_email text;
  normalized_password text;
  payload text;
  signature text;
  session_token text;
BEGIN
  normalized_email := lower(trim(COALESCE(login_email, '')));
  normalized_password := trim(COALESCE(login_password, ''));

  IF normalized_email = '' OR normalized_password = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email e senha são obrigatórios');
  END IF;

  IF length(normalized_email) > 255 OR length(normalized_password) > 255 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Credenciais inválidas');
  END IF;

  SELECT *
  INTO settings_row
  FROM public.whatsapp_page_settings
  ORDER BY created_at ASC
  LIMIT 1;

  IF settings_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Configuração não encontrada');
  END IF;

  IF normalized_email <> lower(trim(COALESCE(settings_row.admin_email, '')))
     OR normalized_password <> trim(COALESCE(settings_row.admin_password, '')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email ou senha incorretos');
  END IF;

  payload := jsonb_build_object(
    'scope', 'whatsapp-admin',
    'email', normalized_email,
    'exp', floor(extract(epoch from now() + interval '12 hours') * 1000)
  )::text;

  signature := encode(hmac(payload, COALESCE(settings_row.session_secret, ''), 'sha256'), 'hex');
  session_token := encode(convert_to(payload, 'utf8'), 'base64') || '.' || signature;

  RETURN jsonb_build_object('success', true, 'token', session_token);
END;
$function$




SET session_replication_role = DEFAULT;
COMMIT;