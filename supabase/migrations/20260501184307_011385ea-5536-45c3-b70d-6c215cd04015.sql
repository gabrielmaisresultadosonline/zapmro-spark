-- Function to increment failed count
CREATE OR REPLACE FUNCTION public.increment_broadcast_failed(b_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.crm_broadcasts
  SET failed_count = COALESCE(failed_count, 0) + 1
  WHERE id = b_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment sent count (if needed, but we already have an update in code)
CREATE OR REPLACE FUNCTION public.increment_broadcast_sent(b_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.crm_broadcasts
  SET sent_count = COALESCE(sent_count, 0) + 1
  WHERE id = b_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
