-- ============================================================
-- ZAPMRO — 9. CRON JOBS
-- ============================================================
-- IMPORTANTE: os jobs que chamam Edge Functions NÃO são criados aqui.
-- Eles são (re)agendados por deploy/atualizar.sh usando PUBLIC_API_URL e
-- ANON_KEY da própria VPS. Assim nunca sobra URL/chave de Supabase externo.
-- Aqui ficam apenas jobs 100% internos ao banco.
-- ============================================================
SET session_replication_role = replica;

SELECT cron.schedule('cleanup-cron-and-net-logs', '17 4 * * *', '
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''2 days'';
  DELETE FROM net._http_response WHERE created < now() - interval ''6 hours'';
');

-- Remove agendamentos legados que apontavam para o Supabase gerenciado.
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobname, command FROM cron.job LOOP
    IF j.command ILIKE '%supabase.co%' THEN
      PERFORM cron.unschedule(j.jobname);
    END IF;
  END LOOP;
END $$;

SET session_replication_role = DEFAULT;
