-- Garantir que o Realtime está ativado para as tabelas principais
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'crm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'crm_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm_contacts;
  END IF;
END $$;

-- Garantir que as tabelas tenham REPLICA IDENTITY FULL para capturar todas as mudanças
ALTER TABLE public.crm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.crm_contacts REPLICA IDENTITY FULL;

-- Ajustar permissões para garantir que o painel (anon role) possa ler as mensagens
-- Nota: Em produção, isso deve ser restrito por auth, mas seguindo a lógica do projeto atual de "painel aberto"
DROP POLICY IF EXISTS "Allow public access to CRM messages" ON public.crm_messages;
CREATE POLICY "Allow public access to CRM messages" 
ON public.crm_messages FOR ALL 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to CRM contacts" ON public.crm_contacts;
CREATE POLICY "Allow public access to CRM contacts" 
ON public.crm_contacts FOR ALL 
USING (true) 
WITH CHECK (true);
