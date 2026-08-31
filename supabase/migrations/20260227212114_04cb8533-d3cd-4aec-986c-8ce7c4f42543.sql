
-- Add response_mode (manual or ai) and ai_prompt to automations
ALTER TABLE public.mro_direct_automations
ADD COLUMN IF NOT EXISTS response_mode text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS ai_prompt text,
ADD COLUMN IF NOT EXISTS comment_reply_text text;

-- Add story_reply as a valid automation type (no constraint needed, it's just text)
