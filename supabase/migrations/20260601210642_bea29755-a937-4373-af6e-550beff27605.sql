CREATE OR REPLACE FUNCTION public.crm_is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crm_profiles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.crm_profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.crm_profiles;

CREATE POLICY "Users can view their own profile"
ON public.crm_profiles
FOR SELECT
USING (auth.uid() = user_id OR public.crm_is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage all profiles"
ON public.crm_profiles
FOR ALL
USING (public.crm_is_super_admin(auth.uid()))
WITH CHECK (public.crm_is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own logs" ON public.crm_access_logs;
CREATE POLICY "Users can view their own logs"
ON public.crm_access_logs
FOR SELECT
USING (auth.uid() = user_id OR public.crm_is_super_admin(auth.uid()));

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.tablename
    FROM pg_policies p
    JOIN information_schema.columns c
      ON c.table_schema = p.schemaname
     AND c.table_name = p.tablename
     AND c.column_name = 'user_id'
    WHERE p.schemaname = 'public'
      AND p.policyname = 'Users can only access their own data'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can only access their own data', r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id OR public.crm_is_super_admin(auth.uid()))',
      'Users can only access their own data',
      r.tablename
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow public access to CRM contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Allow all access to crm_contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "Allow authenticated access to CRM contacts" ON public.crm_contacts;

DROP POLICY IF EXISTS "Allow public access to CRM messages" ON public.crm_messages;
DROP POLICY IF EXISTS "Allow all access to crm_messages" ON public.crm_messages;
DROP POLICY IF EXISTS "Allow authenticated access to CRM messages" ON public.crm_messages;

DROP POLICY IF EXISTS "Allow public access to CRM settings" ON public.crm_settings;
DROP POLICY IF EXISTS "Allow authenticated access to CRM settings" ON public.crm_settings;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_contacts;
  END IF;
END $$;

ALTER TABLE public.crm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.crm_contacts REPLICA IDENTITY FULL;