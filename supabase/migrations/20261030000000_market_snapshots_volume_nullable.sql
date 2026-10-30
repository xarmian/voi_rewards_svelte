-- Apply before deploying fetch-market-data, which writes null for unavailable volume.
alter table public.market_snapshots alter column volume_24h drop not null;
