-- Atualiza registros que ainda usam o Phone Number ID antigo
UPDATE public.crm_settings 
SET meta_phone_number_id = '2206282020152107',
    updated_at = now()
WHERE meta_phone_number_id = '991032527059482';

-- Garante que a linha padrão inicial tenha o novo Phone Number ID caso esteja vazia
UPDATE public.crm_settings 
SET meta_phone_number_id = '2206282020152107',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND (meta_phone_number_id IS NULL OR meta_phone_number_id = '');