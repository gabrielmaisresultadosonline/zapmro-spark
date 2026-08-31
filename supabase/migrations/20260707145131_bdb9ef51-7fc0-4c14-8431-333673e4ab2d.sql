SELECT cron.unschedule('process-countdown-triggers') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-countdown-triggers');

SELECT cron.schedule(
  'process-countdown-triggers',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://adljdeekwifwcdcgbpit.supabase.co/functions/v1/meta-whatsapp-crm',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "processCountdownTriggers"}'::jsonb
  );
  $$
);