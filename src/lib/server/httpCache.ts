// TASK-29: browsers revalidate; shared caches hold public reads and refresh stale copies.
export function publicCache(sMaxAge: number, staleWhileRevalidate: number): Record<string, string> {
	return {
		'Cache-Control': `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`
	};
}

export const CACHE_TTL = Object.freeze({
	markets: Object.freeze({ sMaxAge: 60, staleWhileRevalidate: 300 }),
	'price-history': Object.freeze({ sMaxAge: 60, staleWhileRevalidate: 300 }),
	ohlcv: Object.freeze({ sMaxAge: 60, staleWhileRevalidate: 300 }),
	'voi-price': Object.freeze({ sMaxAge: 60, staleWhileRevalidate: 300 }),
	mimir: Object.freeze({ sMaxAge: 60, staleWhileRevalidate: 300 }),
	'token-analytics': Object.freeze({ sMaxAge: 120, staleWhileRevalidate: 600 }),
	'pool-analytics': Object.freeze({ sMaxAge: 120, staleWhileRevalidate: 600 }),
	tokens: Object.freeze({ sMaxAge: 300, staleWhileRevalidate: 3600 }),
	'token-pairs': Object.freeze({ sMaxAge: 300, staleWhileRevalidate: 3600 }),
	'token-supply': Object.freeze({ sMaxAge: 300, staleWhileRevalidate: 3600 }),
	epochs: Object.freeze({ sMaxAge: 300, staleWhileRevalidate: 3600 }),
	'relay-rewards': Object.freeze({ sMaxAge: 300, staleWhileRevalidate: 3600 }),
	'token-info': Object.freeze({ sMaxAge: 3600, staleWhileRevalidate: 86400 }),
	'medium-posts': Object.freeze({ sMaxAge: 3600, staleWhileRevalidate: 86400 })
});
