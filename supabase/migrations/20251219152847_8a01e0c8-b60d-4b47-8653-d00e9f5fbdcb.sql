-- Adicionar coluna para armazenar URL do print do perfil
ALTER TABLE public.squarecloud_user_profiles 
ADD COLUMN IF NOT EXISTS profile_screenshot_url TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.squarecloud_user_profiles.profile_screenshot_url IS 'URL do print do perfil enviado pelo cliente para análise';