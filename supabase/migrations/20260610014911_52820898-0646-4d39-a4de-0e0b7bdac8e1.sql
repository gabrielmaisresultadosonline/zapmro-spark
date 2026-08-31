
-- Adicionar colunas do Google à tabela crm_settings se não existirem
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_settings' AND column_name='google_client_id') THEN
        ALTER TABLE public.crm_settings ADD COLUMN google_client_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_settings' AND column_name='google_client_secret') THEN
        ALTER TABLE public.crm_settings ADD COLUMN google_client_secret TEXT;
    END IF;
END $$;

-- Garantir permissões
GRANT ALL ON public.crm_settings TO authenticated;
GRANT ALL ON public.crm_settings TO service_role;
