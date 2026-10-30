-- Prerequisites: apply migration A (20261030000000_market_snapshots_volume_nullable.sql)
-- and deploy fetch-market-data before applying this migration.
-- Create these two Vault secrets by hand first (replace placeholders; do not commit values):
-- select vault.create_secret('<project URL>', 'project_url');
-- select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY JWT>', 'market_cron_service_key');
-- After confirming scheduled snapshots, the director can set REQUIRE_SERVICE_ROLE=1
-- with `supabase secrets set REQUIRE_SERVICE_ROLE=1` and retire the external cron.
-- https://supabase.com/docs/guides/functions/schedule-functions

create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

-- No matching row on a fresh database means no unschedule call is made.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fetch-market-data';

select cron.schedule(
    'fetch-market-data',
    '*/10 * * * *',
    $$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
            || '/functions/v1/fetch-market-data',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' ||
                (select decrypted_secret from vault.decrypted_secrets where name = 'market_cron_service_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $$
);
