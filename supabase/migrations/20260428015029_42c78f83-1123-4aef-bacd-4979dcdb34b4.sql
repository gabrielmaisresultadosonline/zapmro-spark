CREATE OR REPLACE FUNCTION increment_crm_metric(metric_column TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE format('INSERT INTO public.crm_metrics (date, %I) 
                    VALUES (CURRENT_DATE, 1) 
                    ON CONFLICT (date) 
                    DO UPDATE SET %I = crm_metrics.%I + 1', metric_column, metric_column, metric_column);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
