/** One point of the /api/price-history series, as PriceChart and displayPrice read it. */
export type PricePoint = { time: string; value: number };

/**
 * The price history a response carries: its body only when the response is OK and the body is
 * an array. An error response (the endpoint answers 500 with { error }), a non-array body or an
 * unparseable body all yield [], so the chart and the price fallback always get an array.
 */
export async function readPriceHistory(response: Response): Promise<PricePoint[]> {
	if (!response.ok) return [];
	try {
		const body: unknown = await response.json();
		return Array.isArray(body) ? body : [];
	} catch {
		return [];
	}
}
