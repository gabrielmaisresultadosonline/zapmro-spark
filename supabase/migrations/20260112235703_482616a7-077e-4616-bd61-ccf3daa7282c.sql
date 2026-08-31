-- Add admin credentials to free_trial_settings
ALTER TABLE public.free_trial_settings 
ADD COLUMN IF NOT EXISTS admin_email TEXT DEFAULT 'mro@gmail.com',
ADD COLUMN IF NOT EXISTS admin_password TEXT DEFAULT 'Ga145523@';

-- Update existing row with admin credentials
UPDATE public.free_trial_settings 
SET admin_email = 'mro@gmail.com', 
    admin_password = 'Ga145523@'
WHERE id IS NOT NULL;