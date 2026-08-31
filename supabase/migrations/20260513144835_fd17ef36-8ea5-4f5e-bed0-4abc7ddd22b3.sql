-- Create profiles table for SaaS users
CREATE TABLE IF NOT EXISTS public.crm_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
    full_name TEXT,
    whatsapp_number TEXT,
    role TEXT DEFAULT 'user', -- 'user' or 'super_admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on crm_profiles
ALTER TABLE public.crm_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for crm_profiles
CREATE POLICY "Users can view their own profile" ON public.crm_profiles
    FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM public.crm_profiles WHERE user_id = auth.uid()) = 'super_admin');

CREATE POLICY "Users can update their own profile" ON public.crm_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Super admins can manage all profiles" ON public.crm_profiles
    FOR ALL USING ((SELECT role FROM public.crm_profiles WHERE user_id = auth.uid()) = 'super_admin');

-- Access logs table
CREATE TABLE IF NOT EXISTS public.crm_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on crm_access_logs
ALTER TABLE public.crm_access_logs ENABLE ROW LEVEL SECURITY;

-- Policies for crm_access_logs
CREATE POLICY "Users can view their own logs" ON public.crm_access_logs
    FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM public.crm_profiles WHERE user_id = auth.uid()) = 'super_admin');

CREATE POLICY "Users can insert their own logs" ON public.crm_access_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update RLS policies for existing crm_ tables to allow super_admin access
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'crm_%') LOOP
        IF t != 'crm_profiles' AND t != 'crm_access_logs' THEN
            EXECUTE format('DROP POLICY IF EXISTS "Users can only access their own data" ON public.%I', t);
            EXECUTE format('CREATE POLICY "Users can only access their own data" ON public.%I FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM public.crm_profiles WHERE user_id = auth.uid()) = ''super_admin'')', t);
        END IF;
    END LOOP;
END $$;
