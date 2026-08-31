-- Encurtador de links do próprio domínio (usado nos botões de template da Meta)
CREATE TABLE IF NOT EXISTS public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  target_url text NOT NULL,
  user_id uuid,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS short_links_user_id_idx ON public.short_links(user_id);

GRANT SELECT, INSERT ON public.short_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "short_links leitura publica" ON public.short_links;
CREATE POLICY "short_links leitura publica"
  ON public.short_links FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "short_links criacao" ON public.short_links;
CREATE POLICY "short_links criacao"
  ON public.short_links FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "short_links dono atualiza" ON public.short_links;
CREATE POLICY "short_links dono atualiza"
  ON public.short_links FOR UPDATE
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "short_links dono remove" ON public.short_links;
CREATE POLICY "short_links dono remove"
  ON public.short_links FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
