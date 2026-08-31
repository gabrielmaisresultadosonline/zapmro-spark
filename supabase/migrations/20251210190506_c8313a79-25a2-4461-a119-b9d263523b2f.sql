-- Create table to store Instagram profiles for SquareCloud users
CREATE TABLE public.squarecloud_user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squarecloud_username text NOT NULL,
  instagram_username text NOT NULL,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(squarecloud_username, instagram_username)
);

-- Enable RLS
ALTER TABLE public.squarecloud_user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (SquareCloud users don't use Supabase auth)
-- We'll validate access through the edge function using SquareCloud credentials
CREATE POLICY "Allow all operations for service role"
  ON public.squarecloud_user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_squarecloud_user_profiles_username ON public.squarecloud_user_profiles(squarecloud_username);

-- Create trigger for updated_at
CREATE TRIGGER update_squarecloud_profiles_updated_at
  BEFORE UPDATE ON public.squarecloud_user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_paid_users_updated_at();