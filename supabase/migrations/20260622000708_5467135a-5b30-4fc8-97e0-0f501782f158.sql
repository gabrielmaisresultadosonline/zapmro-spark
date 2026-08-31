
CREATE TABLE public.admin_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'once' CHECK (frequency IN ('once','always','twice','date_range')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_announcements TO authenticated;
GRANT ALL ON public.admin_announcements TO service_role;
ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed can read active announcements" ON public.admin_announcements
  FOR SELECT TO authenticated USING (active = true);

CREATE TABLE public.admin_announcement_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID NOT NULL REFERENCES public.admin_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.admin_announcement_views TO authenticated;
GRANT ALL ON public.admin_announcement_views TO service_role;
ALTER TABLE public.admin_announcement_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own views" ON public.admin_announcement_views
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ann_views_user ON public.admin_announcement_views(user_id);
CREATE INDEX idx_ann_active ON public.admin_announcements(active);

CREATE TRIGGER update_admin_announcements_updated_at BEFORE UPDATE ON public.admin_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
