import type { OHLCVData, VolumeData, Resolution } from '$lib/types/ohlcv.types';
import type { VoiUsdPoint } from '$lib/utils/price-conversion';
import { createVOITokenPair } from '$lib/utils/chart-adapters';

type Fetch = (url: string) => Promise<Response>;
type ChartDataResult =
	| { data: OHLCVData[]; volumes: VolumeData[]; error: '' }
	| { data?: undefined; volumes?: undefined; error: string };

export function createVoiUsdReference(fetch: Fetch) {
	let voiPriceHistoryCache: VoiUsdPoint[] | null = null;
	let voiPriceHistoryPromise: Promise<VoiUsdPoint[] | null> | null = null;

	// Fetch VOI USD reference data with promise-based caching to prevent duplicate requests
	async function getVoiUsdReferenceData() {
		if (voiPriceHistoryCache) {
			console.log('Using cached VOI USD reference data');
			return voiPriceHistoryCache;
		}

		if (voiPriceHistoryPromise) {
			console.log('VOI USD request already in progress, waiting for result');
			return await voiPriceHistoryPromise;
		}

		console.log('Fetching VOI USD reference data (not cached)');
		voiPriceHistoryPromise = fetch(`/api/price-history?period=24h&token=VOI`)
			.then((response) => response.json())
			.then((voiUsdData) => {
				if (voiUsdData && Array.isArray(voiUsdData) && voiUsdData.length > 0) {
					voiPriceHistoryCache = voiUsdData;
					return voiUsdData;
				}
				return null;
			})
			.finally(() => {
				// Clear the promise once complete so future calls can make new requests if needed
				voiPriceHistoryPromise = null;
			});

		return await voiPriceHistoryPromise;
	}

	return {
		get: getVoiUsdReferenceData,
		reset() {
			voiPriceHistoryCache = null;
			voiPriceHistoryPromise = null;
		}
	};
}

export async function fetchTokenChartData(
	fetch: Fetch,
	getVoiUsdReferenceData: () => Promise<VoiUsdPoint[] | null>,
	tokenId: number,
	resolution: Resolution = '1h',
	quoteCurrency: 'VOI' | 'USD' = 'USD'
): Promise<ChartDataResult | undefined> {
	if (!tokenId || tokenId === 0) return; // Skip for native VOI

	try {
		let chartData: OHLCVData[] = [];
		let volumeData: VolumeData[] = [];

		if (quoteCurrency === 'USD') {
			// For USD, we need to convert VOI-quoted data to USD
			// First get VOI-quoted data
			const voiResponse = await fetch(
				`/api/ohlcv?baseTokenId=${tokenId}&quoteTokenId=390001&resolution=${resolution}&limit=240`
			);
			const voiData = await voiResponse.json();

			if (voiData.candles && voiData.candles.length > 0) {
				// Get VOI USD reference data for conversion (with caching)
				const voiUsdData = await getVoiUsdReferenceData();

				if (voiUsdData && Array.isArray(voiUsdData) && voiUsdData.length > 0) {
					// Convert VOI prices to USD using the conversion utility
					const { convertVoiQuotedCandlesToUsd, convertVoiQuotedVolumesToUsd } = await import(
						'$lib/utils/price-conversion'
					);
					chartData = convertVoiQuotedCandlesToUsd(voiData.candles, voiUsdData);
					volumeData = voiData.volumes
						? convertVoiQuotedVolumesToUsd(voiData.volumes, voiUsdData)
						: [];
				} else {
					// Fallback to VOI data if USD conversion fails
					chartData = voiData.candles;
					volumeData = voiData.volumes || [];
				}
			}
		} else {
			// For VOI, try wVOI first (390001), then fall back to native VOI (0)
			const wvoiResponse = await fetch(
				`/api/ohlcv?baseTokenId=${tokenId}&quoteTokenId=390001&resolution=${resolution}&limit=240`
			);
			const wvoiData = await wvoiResponse.json();

			if (wvoiData.candles && wvoiData.candles.length > 0) {
				chartData = wvoiData.candles;
				volumeData = wvoiData.volumes || [];
			} else {
				// Fall back to native VOI as quote token
				const voiResponse = await fetch(
					`/api/ohlcv?baseTokenId=${tokenId}&quoteTokenId=0&resolution=${resolution}&limit=240`
				);
				const voiData = await voiResponse.json();

				if (voiData.candles && voiData.candles.length > 0) {
					chartData = voiData.candles;
					volumeData = voiData.volumes || [];
				}
			}
		}

		if (chartData.length > 0) {
			return { data: chartData, volumes: volumeData, error: '' };
		} else {
			return { error: 'No chart data available for this token' };
		}
	} catch (error) {
		console.error('Error fetching token chart data:', error);
		return { error: 'Failed to load chart data' };
	}
}

export async function fetchVOIChartData(
	fetch: Fetch,
	resolution: Resolution = '1h',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retain the existing unused currency parameter.
	quoteCurrency: 'VOI' | 'USD' = 'USD'
): Promise<ChartDataResult> {
	try {
		// Fetch VOI/aUSDC OHLCV data from MIMIR
		const voiPair = createVOITokenPair();
		const params = new URLSearchParams({
			baseTokenId: voiPair.baseTokenId.toString(),
			quoteTokenId: voiPair.quoteTokenId.toString(),
			resolution,
			limit: '240'
		});

		const response = await fetch(`/api/ohlcv?${params}`);
		const data = await response.json();

		if (data.error) {
			throw new Error(data.error);
		}

		if (data.candles && data.candles.length > 0) {
			// aUSDC is pegged to USD, so VOI/aUSDC price ≈ VOI/USD
			return { data: data.candles, volumes: data.volumes || [], error: '' };
		} else {
			// Fallback: try to get price-history data if no OHLCV available
			const period = resolution === '1d' || resolution === '4h' ? '7d' : '24h';
			const fallbackResponse = await fetch(`/api/price-history?period=${period}&token=VOI`);
			const fallbackData = await fallbackResponse.json();

			if (Array.isArray(fallbackData) && fallbackData.length > 0) {
				// Convert to pseudo-OHLCV format
				const chartData = fallbackData.map((point: VoiUsdPoint) => {
					const t = point.time;
					const time =
						typeof t === 'number'
							? t
							: typeof t === 'string' && /^\d+$/.test(t)
								? parseInt(t, 10)
								: Math.floor(new Date(t).getTime() / 1000);
					return {
						time,
						open: point.value,
						high: point.value,
						low: point.value,
						close: point.value,
						volume: 0
					};
				});
				return { data: chartData, volumes: [], error: '' };
			} else {
				return { error: 'No chart data available for VOI' };
			}
		}
	} catch (error) {
		console.error('Error fetching VOI chart data:', error);
		return { error: 'Failed to load VOI chart data' };
	}
}
