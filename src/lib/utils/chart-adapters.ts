import type { OHLCVData, VolumeData } from '$lib/types/ohlcv.types';

/**
 * Adapter functions to convert different data formats to OHLCV format
 */

export interface VOIPricePoint {
    time: number;
    value: number;
}

export interface MarketData {
    price: number | null;
    volume_24h: number | null;
    tvl: number | null;
    price_change_percentage_24h: number | null;
    exchange: string;
    pair: string;
    type: string;
    network: string;
    url: string | null;
    pool_url: string | null;
    lastUpdated: Date;
    trading_pair_id: number;
}

/**
 * Converts VOI price history (line chart data) to OHLCV format
 * Since VOI data is just price points, we create pseudo-OHLCV data
 */
export function convertVOItoOHLCV(
    priceHistory: VOIPricePoint[], 
    marketData?: MarketData[]
): { candles: OHLCVData[], volumes: VolumeData[] } {
    if (!priceHistory || priceHistory.length === 0) {
        return { candles: [], volumes: [] };
    }

    // Sort by time to ensure proper ordering
    const sortedHistory = [...priceHistory].sort((a, b) => a.time - b.time);

    const candles: OHLCVData[] = [];
    const volumes: VolumeData[] = [];

    // Calculate volume from market data if available
    const totalVolume = marketData?.reduce((sum, market) => 
        sum + (market.volume_24h || 0), 0) || 0;

    // Distribute volume across time periods
    const volumePerPoint = totalVolume / sortedHistory.length;

    for (let i = 0; i < sortedHistory.length; i++) {
        const current = sortedHistory[i];
        const prev = sortedHistory[i - 1];
        const next = sortedHistory[i + 1];

        // For line chart data, we create pseudo-OHLC where all values are the same
        // This will display as a line when using the chart's line mode
        const price = current.value;
        
        // Add small variations for candlestick display if needed
        // Using the previous/next prices to create realistic OHLC
        let open = price;
        let high = price;
        let low = price;
        let close = price;

        if (prev) {
            open = prev.value;
        }

        // Create small high/low variations based on neighboring points
        if (prev && next) {
            const variation = Math.abs(next.value - prev.value) * 0.1;
            high = Math.max(price, prev.value, next.value) + variation * 0.1;
            low = Math.min(price, prev.value, next.value) - variation * 0.1;
        } else if (prev) {
            const variation = Math.abs(price - prev.value) * 0.1;
            high = Math.max(price, prev.value) + variation * 0.1;
            low = Math.min(price, prev.value) - variation * 0.1;
        }

        candles.push({
            time: current.time,
            open: Math.max(0, open),
            high: Math.max(0, high),
            low: Math.max(0, low),
            close: Math.max(0, close),
            volume: volumePerPoint
        });

        // Volume color based on price movement
        const volumeColor = open <= close ? '#22c55e' : '#ef4444';
        
        volumes.push({
            time: current.time,
            value: volumePerPoint,
            color: volumeColor
        });
    }

    return { candles, volumes };
}

/**
 * Creates a pseudo token pair for VOI to maintain consistency with the interface
 */
export function createVOITokenPair() {
    return {
        baseTokenId: 0, // VOI token ID
        quoteTokenId: 999999, // Pseudo USD token ID
        baseSymbol: 'VOI',
        quoteSymbol: 'USD',
        baseDecimals: 6,
        quoteDecimals: 2,
        poolId: undefined
    };
}

/**
 * Determines if a token should use VOI data or MIMIR data
 */
export function shouldUseVOIData(token: string): boolean {
    return token === 'VOI';
}

/**
 * Gets the appropriate chart type for a token
 */
export function getDefaultChartType(token: string): 'candlestick' | 'line' {
    return token === 'VOI' ? 'line' : 'candlestick';
}

/**
 * Gets the appropriate resolution for a token
 */
export function getDefaultResolution(token: string): string {
    return token === 'VOI' ? '15m' : '1d';
}
