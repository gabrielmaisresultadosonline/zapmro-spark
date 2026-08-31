-- Criar bucket para dados de usuários (JSON files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-data', 'user-data', false)
ON CONFLICT (id) DO NOTHING;

-- Política para usuários autenticados via username
-- Como não usamos auth.uid(), vamos permitir acesso via service role nas edge functions
CREATE POLICY "Service role access for user data"
ON storage.objects
FOR ALL
USING (bucket_id = 'user-data')
WITH CHECK (bucket_id = 'user-data');