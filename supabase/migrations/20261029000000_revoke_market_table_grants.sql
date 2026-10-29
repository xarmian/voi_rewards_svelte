-- TASK-79 high #8: the market tables keep Supabase's default grants, so anon and authenticated
-- hold INSERT/UPDATE/DELETE/TRUNCATE on them. RLS (on in production, with no policies) blocks
-- row writes, but TRUNCATE is not subject to RLS.
--
-- Preflight, traced at 5ccbe63:
-- - Every read of these tables runs server-side with the service role: src/lib/server/markets/sources.ts
--   and src/routes/api/markets/+server.ts (supabasePrivateClient), and get_price_history via
--   supabasePrivateClient. No browser or anon client path reads them, so nothing is granted back.
-- - Writers are the fetch-market-data and fetch-market-data-test edge functions, which use
--   SUPABASE_SERVICE_ROLE_KEY. service_role is untouched here.
-- - get_latest_market_data and get_price_history are SECURITY INVOKER (the plpgsql default), so after
--   this an anon call fails on the table privilege instead of reading through. Nothing in the app calls
--   get_latest_market_data.
-- - Before applying, confirm that no SECURITY DEFINER function anon can execute reaches these tables
--   (one would bypass both RLS and this revoke):
--     SELECT p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE')
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.prosrc ~* '(exchanges|trading_pairs|market_snapshots)';
--   Any row with prosecdef = true and anon EXECUTE = true needs a ruling before this ships.

alter table public.exchanges enable row level security;
alter table public.trading_pairs enable row level security;
alter table public.market_snapshots enable row level security;

revoke all on table public.exchanges, public.trading_pairs, public.market_snapshots
	from anon, authenticated;

revoke all on sequence public.exchanges_id_seq, public.trading_pairs_id_seq, public.market_snapshots_id_seq
	from anon, authenticated;

-- Fail the transaction if any table privilege is left for the API roles.
do $$
declare
	tbl text;
	api_role text;
	priv text;
begin
	foreach tbl in array array['exchanges', 'trading_pairs', 'market_snapshots'] loop
		foreach api_role in array array['anon', 'authenticated'] loop
			foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
				if has_table_privilege(api_role, 'public.' || tbl, priv) then
					raise exception 'TASK-79 #8: % still holds % on public.%', api_role, priv, tbl;
				end if;
			end loop;
		end loop;
	end loop;
end
$$;
