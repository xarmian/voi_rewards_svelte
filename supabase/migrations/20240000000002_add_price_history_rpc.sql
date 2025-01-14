-- Create a function to get aggregated price history
CREATE OR REPLACE FUNCTION get_price_history(
    p_period text DEFAULT '24h',
    p_trading_pair_id integer DEFAULT NULL
)
RETURNS TABLE (
    bucket_time bigint,
    value double precision
) LANGUAGE plpgsql AS $$
DECLARE
    interval_size interval;
    start_date timestamp with time zone;
BEGIN
    -- Set the interval size and start date based on the period
    CASE p_period
        WHEN '24h' THEN
            interval_size := '5 minutes'::interval;
            start_date := now() - '24 hours'::interval;
        WHEN '7d' THEN
            interval_size := '1 hour'::interval;
            start_date := now() - '7 days'::interval;
        WHEN '30d' THEN
            interval_size := '4 hours'::interval;
            start_date := now() - '30 days'::interval;
        WHEN '90d' THEN
            interval_size := '12 hours'::interval;
            start_date := now() - '90 days'::interval;
        ELSE
            interval_size := '5 minutes'::interval;
            start_date := now() - '24 hours'::interval;
    END CASE;

    RETURN QUERY
    WITH bucketed_data AS (
        SELECT
            date_trunc(
                CASE 
                    WHEN interval_size = '5 minutes'::interval THEN 'hour'
                    WHEN interval_size = '1 hour'::interval THEN 'hour'
                    WHEN interval_size = '4 hours'::interval THEN 'day'
                    WHEN interval_size = '12 hours'::interval THEN 'day'
                END,
                timestamp
            ) + 
            CASE 
                WHEN interval_size = '5 minutes'::interval THEN 
                    ((EXTRACT(MINUTE FROM timestamp)::integer / 5) * 5 || ' minutes')::interval
                WHEN interval_size = '4 hours'::interval THEN
                    ((EXTRACT(HOUR FROM timestamp)::integer / 4) * 4 || ' hours')::interval
                WHEN interval_size = '12 hours'::interval THEN
                    ((EXTRACT(HOUR FROM timestamp)::integer / 12) * 12 || ' hours')::interval
                ELSE interval '0'
            END AS bucket,
            SUM(price * volume_24h)::double precision AS price_volume,
            SUM(volume_24h)::double precision AS total_volume
        FROM market_snapshots ms
        WHERE 
            ms.timestamp >= start_date
            AND (p_trading_pair_id IS NULL OR ms.trading_pair_id = p_trading_pair_id)
        GROUP BY bucket
        ORDER BY bucket
    )
    SELECT 
        EXTRACT(EPOCH FROM bucket)::bigint AS bucket_time,
        (CASE 
            WHEN total_volume > 0 THEN price_volume / total_volume
            ELSE price_volume
        END)::double precision AS value
    FROM bucketed_data
    ORDER BY bucket;
END;
$$; 