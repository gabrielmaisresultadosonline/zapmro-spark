-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE crm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_contacts;

-- Ensure RLS is correctly set for these tables if needed
-- (They should already have policies, but let's double check common access)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'crm_messages' AND policyname = 'Allow all access to crm_messages'
    ) THEN
        ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow all access to crm_messages" ON crm_messages FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'crm_contacts' AND policyname = 'Allow all access to crm_contacts'
    ) THEN
        ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow all access to crm_contacts" ON crm_contacts FOR ALL USING (true);
    END IF;
END $$;
