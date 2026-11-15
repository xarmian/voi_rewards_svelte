import type { OHLCVData, VolumeData, Resolution } from '$lib/types/ohlcv.types';

export interface ChartMarket {
	trading_pair_id: number;
	pair: string;
	exchange: string;
	base_token_id: number;
	quote_token_id: number;
}
export interface ChartSnapshot {
	data: OHLCVData[];
	volumes: VolumeData[];
	loading: boolean;
	error: string;
	show: boolean;
}
export interface ChartSelection extends ChartSnapshot {
	tokenId: number | null;
	market: ChartMarket | null;
	/** The quote the pair's candles are shown in once loaded (USD when VOI-quoted candles were converted). */
	quote: string | null;
}

export function resetChartSelection(tokenId: number | null): ChartSelection {
	return {
		tokenId,
		market: null,
		quote: null,
		data: [],
		volumes: [],
		loading: false,
		error: '',
		show: false
	};
}
export function pickMarket(state: ChartSelection, market: ChartMarket): ChartSelection {
	return { ...resetChartSelection(state.tokenId), market, loading: true, show: true };
}
export function selectionForToken(state: ChartSelection, tokenId: number | null): ChartSelection {
	return state.tokenId === tokenId ? state : resetChartSelection(tokenId);
}
export function visibleChart(selection: ChartSelection, token: ChartSnapshot) {
	return {
		...(selection.market ? selection : token),
		title: selection.market ? `${selection.market.pair} chart` : 'Market chart',
		selectedMarket: selection.market,
		selectedQuote: selection.market ? selection.quote : null,
		selectedTradingPairId: selection.market?.trading_pair_id ?? null
	};
}
export function applyChartResult(
	previous: ChartSnapshot,
	result: { data?: OHLCVData[]; volumes?: VolumeData[]; error: string }
): ChartSnapshot {
	if (result.data?.length) {
		return {
			data: result.data,
			volumes: result.volumes ?? [],
			loading: false,
			error: '',
			show: true
		};
	}
	return {
		...previous,
		loading: false,
		error: result.error || 'No chart data available.',
		show: previous.show || previous.data.length > 0
	};
}

export function refreshChart(
	selection: ChartSelection,
	tokenId: number | null,
	resolution: Resolution,
	quote: 'VOI' | 'USD',
	handlers: {
		pair: (market: ChartMarket, resolution: Resolution) => unknown;
		voi: (resolution: Resolution, quote: 'VOI' | 'USD') => unknown;
		token: (tokenId: number, resolution: Resolution, quote: 'VOI' | 'USD') => unknown;
	}
) {
	if (selection.market) return handlers.pair(selection.market, resolution);
	if (tokenId === null) return;
	return tokenId === 0
		? handlers.voi(resolution, quote)
		: handlers.token(tokenId, resolution, quote);
}

/** The quote label for a pair's candles: USD when VOI-quoted candles were converted, else the pair's own quote. */
export function pairQuoteLabel(pair: string, converted: boolean): string {
	const quote = pair.split('/')[1] ?? '';
	return converted && (quote.toUpperCase() === 'VOI' || quote.toUpperCase() === 'WVOI')
		? 'USD'
		: quote;
}

/** A pair's candles arrived: new candles bring their quote label; an empty response keeps the shown candles and their label. */
export function applyPairResult(
	previous: ChartSelection,
	candles: OHLCVData[],
	converted: boolean
): ChartSelection {
	const result = applyChartResult(previous, { data: candles, volumes: [], error: '' });
	return {
		...previous,
		...result,
		quote:
			candles.length && previous.market
				? pairQuoteLabel(previous.market.pair, converted)
				: previous.quote
	};
}

/** Only the newest request may publish; older ones are ignored when they finish late. */
export function createRequestGate() {
	let current = 0;
	return {
		begin: () => ++current,
		isCurrent: (request: number) => request === current,
		invalidate: () => void current++
	};
}

/** A VOI-quoted pair is converted to USD only while USD is the selected quote. */
export function convertsPairToUsd(pair: string, quote: 'VOI' | 'USD'): boolean {
	const pairQuote = (pair.split('/')[1] ?? '').toUpperCase();
	return quote === 'USD' && (pairQuote === 'VOI' || pairQuote === 'WVOI');
}
