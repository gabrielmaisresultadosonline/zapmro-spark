-- Remover a restrição antiga
ALTER TABLE public.crm_flows 
DROP CONSTRAINT IF EXISTS crm_flows_trigger_type_check;

-- Adicionar a nova restrição com suporte aos novos tipos de gatilhos
ALTER TABLE public.crm_flows 
ADD CONSTRAINT crm_flows_trigger_type_check 
CHECK (trigger_type = ANY (ARRAY['keyword'::text, 'all_messages'::text, 'first_message'::text, 'manual'::text, 'new_contact'::text, '24h_inactivity'::text]));