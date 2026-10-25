import { describe, expect, it } from 'vitest';
import { CACHE_TTL, publicCache } from './httpCache';

describe('TASK-29 public HTTP cache policy', () => {
	it('keeps browsers revalidating while the CDN caches and revalidates in the background', () => {
		expect(publicCache(60, 300)).toEqual({
			'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
		});
	});

	it('freezes exactly the 14 endpoint policies with positive, ordered TTLs', () => {
		expect(Object.keys(CACHE_TTL).sort()).toEqual(
			[
				'markets',
				'price-history',
				'ohlcv',
				'voi-price',
				'mimir',
				'token-analytics',
				'pool-analytics',
				'tokens',
				'token-pairs',
				'token-supply',
				'epochs',
				'relay-rewards',
				'token-info',
				'medium-posts'
			].sort()
		);
		expect(Object.isFrozen(CACHE_TTL)).toBe(true);
		for (const policy of Object.values(CACHE_TTL)) {
			expect(Object.isFrozen(policy)).toBe(true);
			expect(policy.sMaxAge).toBeGreaterThan(0);
			expect(policy.staleWhileRevalidate).toBeGreaterThanOrEqual(policy.sMaxAge);
		}
	});
});
