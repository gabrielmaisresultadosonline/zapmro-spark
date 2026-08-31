-- Ensure crm_statuses table has sort_order
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_statuses' AND column_name = 'sort_order') THEN
    ALTER TABLE public.crm_statuses ADD COLUMN sort_order INTEGER DEFAULT 0;
  END IF;
END $$;

-- Update sort_order for existing records if they are 0
UPDATE public.crm_statuses SET sort_order = 10 WHERE value = 'new' AND sort_order = 0;
UPDATE public.crm_statuses SET sort_order = 20 WHERE value = 'responded' AND sort_order = 0;
UPDATE public.crm_statuses SET sort_order = 30 WHERE value = 'qualified' AND sort_order = 0;
UPDATE public.crm_statuses SET sort_order = 40 WHERE value = 'human' AND sort_order = 0;
UPDATE public.crm_statuses SET sort_order = 50 WHERE value = 'closed' AND sort_order = 0;
UPDATE public.crm_statuses SET sort_order = 60 WHERE value = 'lost' AND sort_order = 0;