-- Table for free trial registrations
CREATE TABLE public.free_trial_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  instagram_username TEXT NOT NULL,
  generated_username TEXT NOT NULL,
  generated_password TEXT NOT NULL,
  mro_master_user TEXT NOT NULL,
  registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  instagram_removed BOOLEAN DEFAULT FALSE,
  instagram_removed_at TIMESTAMP WITH TIME ZONE,
  email_sent BOOLEAN DEFAULT FALSE,
  expiration_email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index on instagram_username to prevent duplicates
CREATE UNIQUE INDEX idx_free_trial_instagram ON public.free_trial_registrations(instagram_username);

-- Index for checking expirations
CREATE INDEX idx_free_trial_expires_at ON public.free_trial_registrations(expires_at);

-- Table for free trial admin settings
CREATE TABLE public.free_trial_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mro_master_username TEXT NOT NULL,
  mro_master_password TEXT NOT NULL,
  welcome_video_url TEXT,
  installation_video_url TEXT,
  usage_video_url TEXT,
  download_link TEXT,
  group_link TEXT,
  trial_duration_hours INTEGER DEFAULT 24,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.free_trial_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_trial_settings ENABLE ROW LEVEL SECURITY;

-- Public can insert registrations (for new trials)
CREATE POLICY "Anyone can register for trial" 
ON public.free_trial_registrations 
FOR INSERT 
WITH CHECK (true);

-- Public can read their own registration (by instagram)
CREATE POLICY "Anyone can check trial status" 
ON public.free_trial_registrations 
FOR SELECT 
USING (true);

-- Public can read settings
CREATE POLICY "Anyone can read trial settings" 
ON public.free_trial_settings 
FOR SELECT 
USING (true);

-- Insert default settings
INSERT INTO public.free_trial_settings (
  mro_master_username,
  mro_master_password,
  welcome_video_url,
  installation_video_url,
  usage_video_url,
  download_link,
  group_link,
  trial_duration_hours
) VALUES (
  'testegratuito',
  'mro2025',
  '',
  '',
  '',
  '',
  '',
  24
);

-- Enable realtime for registrations
ALTER PUBLICATION supabase_realtime ADD TABLE public.free_trial_registrations;