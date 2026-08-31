-- Adicionar política de leitura para usuários autenticados na tabela zapi_flows
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'zapi_flows' 
        AND policyname = 'Users can view flows'
    ) THEN
        CREATE POLICY "Users can view flows" 
        ON public.zapi_flows 
        FOR SELECT 
        USING (true);
    END IF;
END $$;