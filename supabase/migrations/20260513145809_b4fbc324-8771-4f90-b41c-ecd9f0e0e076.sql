-- Fix crm_google_accounts table for multi-tenancy
ALTER TABLE public.crm_google_accounts DROP CONSTRAINT IF EXISTS crm_google_accounts_email_key;

-- Ensure user_id has a unique constraint with email if we want to allow the same email across different users (though unlikely)
-- Or just unique per user_id if we only allow one account per user.
-- Let's go with UNIQUE(user_id, email) to be flexible.
ALTER TABLE public.crm_google_accounts ADD CONSTRAINT crm_google_accounts_user_email_key UNIQUE (user_id, email);

-- Fix RLS Policies
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.crm_google_accounts;

CREATE POLICY "Users can view their own google accounts"
ON public.crm_google_accounts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own google accounts"
ON public.crm_google_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own google accounts"
ON public.crm_google_accounts
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own google accounts"
ON public.crm_google_accounts
FOR DELETE
USING (auth.uid() = user_id);
