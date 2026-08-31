CREATE OR REPLACE FUNCTION public.admin_dump_policies()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  out_sql text := '';
  v_roles text;
BEGIN
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
    SELECT p.tablename, p.policyname, p.permissive, p.roles AS pol_roles, p.cmd, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
    ORDER BY p.tablename, p.policyname
  LOOP
    SELECT string_agg(quote_ident(x), ', ') INTO v_roles FROM unnest(r.pol_roles) AS x;
    out_sql := out_sql || format(
      'DROP POLICY IF EXISTS %I ON public.%I;',
      r.policyname, r.tablename
    ) || E'\n' || format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
      r.policyname, r.tablename, r.permissive, r.cmd,
      COALESCE(v_roles, 'PUBLIC'),
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END
    ) || E'\n';
  END LOOP;
  RETURN out_sql;
END;
$function$;