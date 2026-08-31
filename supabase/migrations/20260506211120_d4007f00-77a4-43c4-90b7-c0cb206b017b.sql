-- Create profiles table for MRO Criativo users
CREATE TABLE IF NOT EXISTS public.mro_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    instagram_username TEXT,
    instagram_id TEXT,
    meta_access_token TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create images table for MRO Criativo
CREATE TABLE IF NOT EXISTS public.mro_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    prompt TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create schedules table for MRO Criativo
CREATE TABLE IF NOT EXISTS public.mro_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content_text TEXT,
    image_id UUID REFERENCES public.mro_images(id) ON DELETE SET NULL,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, posted, failed
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create strategies table for MRO Criativo
CREATE TABLE IF NOT EXISTS public.mro_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT, -- authority, engagement, viral
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mro_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mro_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mro_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mro_strategies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mro_profiles
CREATE POLICY "Users can view their own profile" ON public.mro_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.mro_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.mro_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for mro_images
CREATE POLICY "Users can view their own images" ON public.mro_images FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own images" ON public.mro_images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own images" ON public.mro_images FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for mro_schedules
CREATE POLICY "Users can view their own schedules" ON public.mro_schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own schedules" ON public.mro_schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own schedules" ON public.mro_schedules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own schedules" ON public.mro_schedules FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for mro_strategies
CREATE POLICY "Users can view their own strategies" ON public.mro_strategies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own strategies" ON public.mro_strategies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own strategies" ON public.mro_strategies FOR DELETE USING (auth.uid() = user_id);

-- Function and trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_mro_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_mro_profiles_updated_at BEFORE UPDATE ON public.mro_profiles FOR EACH ROW EXECUTE FUNCTION public.handle_mro_updated_at();
CREATE TRIGGER tr_mro_schedules_updated_at BEFORE UPDATE ON public.mro_schedules FOR EACH ROW EXECUTE FUNCTION public.handle_mro_updated_at();
