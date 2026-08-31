-- Add UPDATE policy for free_trial_settings
CREATE POLICY "Anyone can update trial settings" 
ON public.free_trial_settings 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- Add UPDATE policy for free_trial_registrations (for marking as removed, email sent, etc)
CREATE POLICY "Anyone can update trial registrations" 
ON public.free_trial_registrations 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- Add DELETE policy for free_trial_registrations (for admin to delete)
CREATE POLICY "Anyone can delete trial registrations" 
ON public.free_trial_registrations 
FOR DELETE 
USING (true);