import { supabase } from '@/integrations/supabase/client';

export const normalizeInstagramUsername = (value: string) =>
  value.toLowerCase().replace('@', '').trim();

/**
 * No client-side OCR — the edge function handles username validation via DeepSeek.
 * This stub returns empty text so callers don't break.
 */
export const readInstagramScreenshot = async (_source: File | string): Promise<{ text: string; detectedUsername: string | null }> => {
  return { text: '', detectedUsername: null };
};

export const restoreStoredScreenshot = async ({
  username,
  squarecloudUsername,
  screenshotUrl,
}: {
  username: string;
  squarecloudUsername: string;
  screenshotUrl?: string | null;
}) => {
  const action = screenshotUrl ? 'set' : 'clear';

  const { error } = await supabase.functions.invoke('upload-profile-screenshot', {
    body: {
      action,
      username,
      squarecloud_username: squarecloudUsername,
      screenshot_url: screenshotUrl ?? null,
    },
  });

  if (error) {
    console.error('Erro ao restaurar screenshot salvo:', error);
  }
};