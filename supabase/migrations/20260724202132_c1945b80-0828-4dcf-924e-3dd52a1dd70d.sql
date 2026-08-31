
SELECT cron.unschedule('process-scheduled-messages') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-messages');
SELECT cron.unschedule('process-countdown-triggers') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-countdown-triggers');

SELECT cron.schedule(
  'process-scheduled-messages',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aossudsganqiapcoqthe.supabase.co/functions/v1/meta-whatsapp-crm',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "processScheduled"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'process-countdown-triggers',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aossudsganqiapcoqthe.supabase.co/functions/v1/meta-whatsapp-crm',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "processCountdownTriggers"}'::jsonb
  );
  $$
);
