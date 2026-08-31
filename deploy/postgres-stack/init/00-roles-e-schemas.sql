-- =============================================================================
--  Base do banco próprio: roles, schemas e extensões que o Supabase SaaS já tinha.
--  Roda automaticamente na PRIMEIRA subida do container do Postgres.
-- =============================================================================
\set pgpass `echo "$POSTGRES_PASSWORD"`

-- ------------------------------------------------------------------- roles --
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  ELSE
    ALTER ROLE service_role BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE format('CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD %L', :'pgpass');
  ELSE
    EXECUTE format('ALTER ROLE authenticator PASSWORD %L', :'pgpass');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE format('CREATE ROLE supabase_auth_admin LOGIN CREATEROLE NOINHERIT PASSWORD %L', :'pgpass');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    EXECUTE format('CREATE ROLE supabase_storage_admin LOGIN CREATEROLE NOINHERIT BYPASSRLS PASSWORD %L', :'pgpass');
  ELSE
    ALTER ROLE supabase_storage_admin CREATEROLE BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE format('CREATE ROLE supabase_admin LOGIN SUPERUSER PASSWORD %L', :'pgpass');
  ELSE
    EXECUTE format('ALTER ROLE supabase_admin PASSWORD %L', :'pgpass');
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
-- Storage API muda para o papel contido no JWT durante cada requisição.
-- Sem estas associações, até a service key termina sujeita às policies de RLS.
GRANT anon, authenticated, service_role TO supabase_storage_admin;
GRANT ALL ON DATABASE postgres TO supabase_admin;
GRANT ALL ON DATABASE postgres TO supabase_auth_admin;
GRANT ALL ON DATABASE postgres TO supabase_storage_admin;

-- ----------------------------------------------------------------- schemas --
CREATE SCHEMA IF NOT EXISTS auth       AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage    AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS realtime   AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS _realtime  AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS graphql_public AUTHORIZATION supabase_admin;

-- ---------------------------------------------------------------- extensões --
-- Os schemas precisam existir antes de instalar extensões neles.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgjwt        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net       WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA public     TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth       TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage    TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA storage TO service_role;

-- Compatibilidade com o código existente: auth.uid() / auth.role() / auth.jwt()
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (auth.jwt() ->> 'sub')
  ), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    current_setting('request.jwt.claim.role', true),
    (auth.jwt() ->> 'role')
  ), '')::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    current_setting('request.jwt.claim.email', true),
    (auth.jwt() ->> 'email')
  ), '')::text
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt(), auth.email()
  TO anon, authenticated, service_role;

-- Defaults para tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role, anon;

-- Publicação usada pelo Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
