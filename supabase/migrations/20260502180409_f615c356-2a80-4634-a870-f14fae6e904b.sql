-- Adicionar coluna message_template se não existir
ALTER TABLE public.crm_webhooks ADD COLUMN IF NOT EXISTS message_template TEXT;

-- Garantir que a coluna default_status existe (já existe mas por segurança)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_webhooks' AND column_name = 'default_status') THEN
        ALTER TABLE public.crm_webhooks ADD COLUMN default_status TEXT DEFAULT 'pending';
    END IF;
END $$;
