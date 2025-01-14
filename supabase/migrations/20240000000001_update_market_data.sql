-- Update the get_latest_market_data function to include trading_pair_id
create or replace function get_latest_market_data()
returns table (
    exchange_name text,
    exchange_type exchange_type,
    exchange_network network_type,
    base_token text,
    quote_token text,
    price numeric,
    volume_24h numeric,
    tvl numeric,
    high_24h numeric,
    low_24h numeric,
    price_change_24h numeric,
    price_change_percentage_24h numeric,
    snapshot_time timestamp with time zone,
    exchange_url text,
    pool_url text,
    trading_pair_id integer
) as $$
begin
    return query
    with latest_snapshots as (
        select 
            ms.*,
            row_number() over (
                partition by ms.trading_pair_id 
                order by ms.timestamp desc
            ) as rn
        from market_snapshots ms
    )
    select 
        e.name as exchange_name,
        e.type as exchange_type,
        e.network as exchange_network,
        tp.base_token,
        tp.quote_token,
        ls.price,
        ls.volume_24h,
        ls.tvl,
        ls.high_24h,
        ls.low_24h,
        ls.price_change_24h,
        ls.price_change_percentage_24h,
        ls.timestamp as snapshot_time,
        e.url as exchange_url,
        tp.pool_url,
        tp.id as trading_pair_id
    from latest_snapshots ls
    inner join trading_pairs tp on ls.trading_pair_id = tp.id
    inner join exchanges e on tp.exchange_id = e.id
    where ls.rn = 1
    order by e.name, tp.base_token, tp.quote_token;
end;
$$ language plpgsql; 