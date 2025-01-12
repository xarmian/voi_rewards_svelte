-- Create enum for exchange types
create type exchange_type as enum ('CEX', 'DEX');

-- Create enum for networks
create type network_type as enum ('Centralized', 'Voi', 'Algorand');

-- Create table for tracking exchanges
create table if not exists exchanges (
    id serial primary key,
    name text not null,
    type exchange_type not null,
    network network_type not null,
    url text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Create table for trading pairs
create table if not exists trading_pairs (
    id serial primary key,
    exchange_id integer references exchanges(id),
    base_token text not null,
    quote_token text not null,
    contract_address text, -- For DEX pools
    pool_url text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(exchange_id, base_token, quote_token)
);

-- Create table for market data snapshots
create table if not exists market_snapshots (
    id serial primary key,
    trading_pair_id integer references trading_pairs(id),
    price numeric not null,
    volume_24h numeric not null,
    tvl numeric, -- Null for CEX
    high_24h numeric,
    low_24h numeric,
    price_change_24h numeric,
    price_change_percentage_24h numeric,
    timestamp timestamp with time zone default now()
);

-- Create function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger update_exchanges_updated_at
    before update on exchanges
    for each row
    execute function update_updated_at_column();

create trigger update_trading_pairs_updated_at
    before update on trading_pairs
    for each row
    execute function update_updated_at_column();

-- Insert initial exchange data
insert into exchanges (name, type, network) values
    ('MEXC', 'CEX', 'Centralized'),
    ('Humble', 'DEX', 'Voi'),
    ('Nomadex', 'DEX', 'Voi'),
    ('Tinyman', 'DEX', 'Algorand'),
    ('PactFi', 'DEX', 'Algorand');

-- Insert initial trading pairs
insert into trading_pairs (exchange_id, base_token, quote_token) values
    (1, 'VOI', 'USDT'), -- MEXC
    (2, 'VOI', 'USDC'), -- Humble
    (3, 'VOI', 'USDC'), -- Nomadex
    (4, 'VOI', 'ALGO'), -- Tinyman
    (5, 'VOI', 'ALGO'); -- PactFi

-- Create index for faster queries
create index market_snapshots_timestamp_idx on market_snapshots(timestamp);
create index market_snapshots_trading_pair_idx on market_snapshots(trading_pair_id);

-- Create function to get latest market data
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
    pool_url text
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
        tp.pool_url
    from latest_snapshots ls
    inner join trading_pairs tp on ls.trading_pair_id = tp.id
    inner join exchanges e on tp.exchange_id = e.id
    where ls.rn = 1
    order by e.name, tp.base_token, tp.quote_token;
end;
$$ language plpgsql; 