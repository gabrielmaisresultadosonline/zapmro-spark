
-- Full dump helpers: functions, triggers, RLS policies, indexes, FKs, grants

CREATE OR REPLACE FUNCTION public.admin_dump_functions()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_dump_triggers()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_dump_policies()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_dump_indexes()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_dump_fks()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_dump_grants()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dump_functions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_dump_triggers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_dump_policies() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_dump_indexes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_dump_fks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_dump_grants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dump_functions() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_triggers() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_policies() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_indexes() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_fks() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dump_grants() TO service_role;
