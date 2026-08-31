-- Adiciona coluna last_read_at na tabela crm_contacts se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'crm_contacts' AND column_name = 'last_read_at') THEN
    ALTER TABLE public.crm_contacts ADD COLUMN last_read_at TIMESTAMP WITH TIME ZONE DEFAULT now();
  END IF;
END $$;

-- Garante que o RLS está habilitado e políticas existem (visto que já existem políticas no projeto)
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
