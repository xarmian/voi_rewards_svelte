// OHLCV Type Definitions for Charting System

export type Resolution = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface PriceCandle {
	base_token_id: number;
	quote_token_id: number;
	resolution: Resolution;
	bucket_start: string;
	open: string;
	high: string;
	low: string;
	close: string;
	volume_base: string;
	volume_quote: string;
	trades_count: number;
}

export interface PoolCatalog {
	pool_id: number;
	token_a_id: number;
	token_a_type: 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN';
	token_a_symbol: string;
	token_a_decimals: number;
	token_b_id: number;
	token_b_type: 'VOI' | 'ARC200' | 'ASA' | 'UNKNOWN';
	token_b_symbol: string;
	token_b_decimals: number;
	lp_asset_id: number;
	escrow_hex: string;
}

export interface DexSwap {
	id: number;
	ts: string;
	base_token_id: number;
	quote_token_id: number;
	price_quote: string;
	volume_base: string;
	volume_quote: string;
	pool_id?: number;
}

// Chart-specific types
export interface OHLCVData {
	time: number; // Unix timestamp in seconds
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface VolumeData {
	time: number;
	value: number;
	color?: string;
}

export interface TokenPair {
	baseTokenId: number;
	quoteTokenId: number;
	baseSymbol: string;
	quoteSymbol: string;
	baseDecimals: number;
	quoteDecimals: number;
	poolId?: number;
}

export interface ChartTimeRange {
	start: Date;
	end: Date;
}

export interface OHLCVRequest {
	baseTokenId: number;
	quoteTokenId: number;
	resolution: Resolution;
	start?: Date;
	end?: Date;
	limit?: number;
	refresh?: boolean;
}

export interface OHLCVResponse {
	baseTokenId: number;
	quoteTokenId: number;
	resolution: Resolution;
	start: number;
	end: number;
	count: number;
	candles: OHLCVData[];
	volumes: VolumeData[];
}

export interface ChartSettings {
	chartType: 'candlestick' | 'line';
	resolution: Resolution;
	autoRefresh: boolean;
	refreshInterval: number; // minutes
	showVolume: boolean;
	theme: 'light' | 'dark';
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
	chartType: 'candlestick',
	resolution: '1h',
	autoRefresh: false,
	refreshInterval: 5,
	showVolume: true,
	theme: 'light'
};

export const RESOLUTION_LABELS: Record<Resolution, string> = {
	'1m': '1 Minute',
	'5m': '5 Minutes',
	'15m': '15 Minutes',
	'1h': '1 Hour',
	'4h': '4 Hours',
	'1d': '1 Day'
};

export const RESOLUTION_INTERVALS: Record<Resolution, number> = {
	'1m': 60,
	'5m': 300,
	'15m': 900,
	'1h': 3600,
	'4h': 14400,
	'1d': 86400
};
