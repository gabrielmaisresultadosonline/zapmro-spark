-- Add user_id to all crm_ tables and set up RLS
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'crm_%') LOOP
        -- Add user_id column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = t AND column_name = 'user_id'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid()', t);
        END IF;

        -- Enable Row Level Security
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        
        -- Drop existing policies to avoid conflicts
        EXECUTE format('DROP POLICY IF EXISTS "Users can only access their own data" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can only insert their own data" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can only update their own data" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can only delete their own data" ON public.%I', t);
        
        -- Create policies
        EXECUTE format('CREATE POLICY "Users can only access their own data" ON public.%I FOR SELECT USING (auth.uid() = user_id)', t);
        EXECUTE format('CREATE POLICY "Users can only insert their own data" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t);
        EXECUTE format('CREATE POLICY "Users can only update their own data" ON public.%I FOR UPDATE USING (auth.uid() = user_id)', t);
        EXECUTE format('CREATE POLICY "Users can only delete their own data" ON public.%I FOR DELETE USING (auth.uid() = user_id)', t);
    END LOOP;
END $$;

-- Special constraint for crm_settings to ensure one set of settings per user
ALTER TABLE public.crm_settings DROP CONSTRAINT IF EXISTS crm_settings_user_id_key;
ALTER TABLE public.crm_settings ADD CONSTRAINT crm_settings_user_id_key UNIQUE (user_id);

-- Add webhook_identifier to crm_settings
ALTER TABLE public.crm_settings ADD COLUMN IF NOT EXISTS webhook_identifier TEXT UNIQUE DEFAULT gen_random_uuid()::text;
