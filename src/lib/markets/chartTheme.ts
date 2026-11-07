import {
	ColorType,
	LastPriceAnimationMode,
	type CandlestickData,
	type ChartOptions,
	type DeepPartial,
	type HistogramData,
	type SeriesPartialOptionsMap,
	type UTCTimestamp
} from 'lightweight-charts';

// Defined Aurora fallbacks also cover hosts rendered before custom properties are available.
const fallbackChannels = {
	surface: '255 255 255',
	ink: '27 20 51',
	'ink-muted': '102 93 134',
	edge: '139 128 173',
	grid: '238 233 251',
	'accent-fill': '124 58 237',
	ok: '4 120 87',
	danger: '190 18 60',
	'series-3': '180 83 9',
	focus: '109 40 217'
} as const;

type TokenName = keyof typeof fallbackChannels;
export type ChartTokens = Record<TokenName, string> & { fontFamily: string };
type ComputedTokens = Pick<CSSStyleDeclaration, 'getPropertyValue' | 'fontFamily'>;

function color(channels: string, fallback: string): string {
	const parts = channels.trim().split(/[\s,]+/);
	const valid =
		parts.length === 3 && parts.every((v) => /^\d+(?:\.\d+)?$/.test(v) && Number(v) <= 255);
	return `rgb(${(valid ? parts : fallback.split(' ')).join(', ')})`;
}

export function resolveChartTokens(style: ComputedTokens): ChartTokens {
	const resolved = Object.fromEntries(
		(Object.keys(fallbackChannels) as TokenName[]).map((name) => [
			name,
			color(style.getPropertyValue(`--c-${name}`), fallbackChannels[name])
		])
	) as Record<TokenName, string>;
	return { ...resolved, fontFamily: style.fontFamily.trim() || 'Lato, sans-serif' };
}

export function chartThemeOptions(tokens: ChartTokens) {
	return {
		chart: {
			layout: {
				background: { type: ColorType.Solid, color: tokens.surface },
				textColor: tokens.ink,
				fontFamily: tokens.fontFamily,
				fontSize: 13
			},
			grid: { vertLines: { color: tokens.grid }, horzLines: { color: tokens.grid } },
			rightPriceScale: { borderColor: tokens.edge, textColor: tokens['ink-muted'] },
			timeScale: { borderColor: tokens.edge },
			crosshair: {
				vertLine: { color: tokens['ink-muted'], labelBackgroundColor: tokens.surface },
				horzLine: { color: tokens['ink-muted'], labelBackgroundColor: tokens.surface }
			},
			// Keep inertia disabled for both motion preferences; theme updates never animate a fit.
			kineticScroll: { mouse: false, touch: false }
		} satisfies DeepPartial<ChartOptions>,
		line: {
			color: tokens['accent-fill'],
			priceLineColor: tokens['accent-fill'],
			lastPriceAnimation: LastPriceAnimationMode.Disabled
		} satisfies SeriesPartialOptionsMap['Line'],
		candles: {
			upColor: tokens.ok,
			downColor: tokens.danger,
			borderUpColor: tokens.ok,
			borderDownColor: tokens.danger,
			wickUpColor: tokens.ok,
			wickDownColor: tokens.danger,
			priceLineColor: tokens['accent-fill']
		} satisfies SeriesPartialOptionsMap['Candlestick'],
		volume: { color: tokens['series-3'] } satisfies SeriesPartialOptionsMap['Histogram']
	};
}

// Only renderer copies receive point colors. OHLC geometry remains a direction cue.
export function themedCandles(
	data: readonly { time: number; open: number; high: number; low: number; close: number }[],
	tokens: ChartTokens
): CandlestickData[] {
	return data.map(({ time, open, high, low, close }) => {
		const direction = close > open ? tokens.ok : close < open ? tokens.danger : tokens['ink-muted'];
		return {
			time: time as UTCTimestamp,
			open,
			high,
			low,
			close,
			color: direction,
			borderColor: direction,
			wickColor: direction
		};
	});
}

export function themedVolumes(data: readonly { time: number; value: number }[]): HistogramData[] {
	return data.map(({ time, value }) => ({ time: time as UTCTimestamp, value }));
}
