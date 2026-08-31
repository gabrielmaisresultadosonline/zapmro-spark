-- ============================================================
-- ZAPMRO — 8.2 STORAGE: RLS de storage.objects
-- A migração recriou os buckets, mas não as policies de storage.objects.
-- Sem elas todo upload do app falha com:
--   "new row violates row-level security policy"
-- (erro visto ao subir áudio/vídeo/imagem nos blocos de fluxo).
-- ============================================================

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON storage.objects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT ALL ON storage.buckets TO service_role;

-- Buckets públicos: leitura liberada para qualquer visitante.
DROP POLICY IF EXISTS "zapmro_public_read" ON storage.objects;
CREATE POLICY "zapmro_public_read"
  ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    bucket_id IN (
      'assets',
      'crm-media',
      'inteligencia-fotos',
      'metodo-seguidor-content',
      'profile-cache',
      'trial-screenshots',
      'user-data'
    )
  );

-- Usuários autenticados podem enviar/atualizar/remover arquivos nos buckets do app.
DROP POLICY IF EXISTS "zapmro_auth_insert" ON storage.objects;
CREATE POLICY "zapmro_auth_insert"
  ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN (
      'assets',
      'crm-media',
      'inteligencia-fotos',
      'metodo-seguidor-backup',
      'metodo-seguidor-content',
      'profile-cache',
      'trial-screenshots',
      'user-data'
    )
  );

DROP POLICY IF EXISTS "zapmro_auth_update" ON storage.objects;
CREATE POLICY "zapmro_auth_update"
  ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN (
      'assets',
      'crm-media',
      'inteligencia-fotos',
      'metodo-seguidor-backup',
      'metodo-seguidor-content',
      'profile-cache',
      'trial-screenshots',
      'user-data'
    )
  )
  WITH CHECK (
    bucket_id IN (
      'assets',
      'crm-media',
      'inteligencia-fotos',
      'metodo-seguidor-backup',
      'metodo-seguidor-content',
      'profile-cache',
      'trial-screenshots',
      'user-data'
    )
  );

DROP POLICY IF EXISTS "zapmro_auth_delete" ON storage.objects;
CREATE POLICY "zapmro_auth_delete"
  ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id IN (
      'assets',
      'crm-media',
      'inteligencia-fotos',
      'metodo-seguidor-backup',
      'metodo-seguidor-content',
      'profile-cache',
      'trial-screenshots',
      'user-data'
    )
  );

-- Edge Functions (service_role) já ignoram RLS, mas mantemos a policy explícita
-- para o caso de o Storage rodar com role autenticada de serviço.
DROP POLICY IF EXISTS "zapmro_service_all" ON storage.objects;
CREATE POLICY "zapmro_service_all"
  ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
