-- Add DELETE policy for paid_users to allow users to delete their own data (GDPR compliance)
CREATE POLICY "Users can delete own data"
  ON paid_users
  FOR DELETE
  TO authenticated
  USING (email = ((current_setting('request.jwt.claims'::text, true))::json ->> 'email'::text));