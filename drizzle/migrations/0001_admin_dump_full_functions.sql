-- Extensions
CREATE OR REPLACE FUNCTION public.admin_dump_extensions()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END; $function$;

-- Custom types (enums, domains, composites)
CREATE OR REPLACE FUNCTION public.admin_dump_types()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END; $function$;

-- Sequences
CREATE OR REPLACE FUNCTION public.admin_dump_sequences()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END; $function$;

-- Views and materialized views
CREATE OR REPLACE FUNCTION public.admin_dump_views()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; out_sql text := '';
BEGIN
  FOR r IN SELECT viewname, definition FROM pg_views WHERE schemaname = 'public' ORDER BY viewname LOOP
    out_sql := out_sql || format('CREATE OR REPLACE VIEW public.%I AS %s', r.viewname, r.definition) || E'\n';
  END LOOP;
  FOR r IN SELECT matviewname AS viewname, definition FROM pg_matviews WHERE schemaname = 'public' ORDER BY matviewname LOOP
    out_sql := out_sql || format(E'DROP MATERIALIZED VIEW IF EXISTS public.%I;\nCREATE MATERIALIZED VIEW public.%I AS %s', r.viewname, r.viewname, r.definition) || E'\n';
  END LOOP;
  RETURN out_sql;
END; $function$;

-- Auth users
CREATE OR REPLACE FUNCTION public.admin_dump_auth_users(p_offset integer DEFAULT 0, p_limit integer DEFAULT 500)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_dump_auth_identities(p_offset integer DEFAULT 0, p_limit integer DEFAULT 500)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_count_auth_users()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT count(*) FROM auth.users;
$function$;

-- Storage inventory (buckets + object paths, as reference comments/statements built at runtime)
CREATE OR REPLACE FUNCTION public.admin_dump_storage(p_offset integer DEFAULT 0, p_limit integer DEFAULT 2000)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END; $function$;

-- Cron jobs
CREATE OR REPLACE FUNCTION public.admin_dump_cron()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; out_sql text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RETURN '-- pg_cron nao instalado';
  END IF;
  FOR r IN EXECUTE 'SELECT jobname, schedule, command FROM cron.job ORDER BY jobid' LOOP
    out_sql := out_sql || format('SELECT cron.schedule(%L, %L, %L);', r.jobname, r.schedule, r.command) || E'\n';
  END LOOP;
  RETURN out_sql;
END; $function$;

REVOKE ALL ON FUNCTION public.admin_dump_extensions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_types() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_sequences() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_views() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_auth_users(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_auth_identities(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_count_auth_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_storage(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dump_cron() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_dump_extensions() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_types() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_sequences() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_views() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_auth_users(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_auth_identities(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_count_auth_users() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_storage(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_cron() TO service_role;