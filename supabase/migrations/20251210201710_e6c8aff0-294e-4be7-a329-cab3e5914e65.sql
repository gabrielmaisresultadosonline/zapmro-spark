-- Remove the dangerous policy that allows all operations
DROP POLICY IF EXISTS "Allow all operations for service role" ON squarecloud_user_profiles;

-- Create restrictive policy for service role only (edge functions)
CREATE POLICY "Service role full access"
  ON squarecloud_user_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');