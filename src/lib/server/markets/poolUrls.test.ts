import { describe, expect, it } from 'vitest';
import { getPoolUrl } from './poolUrls';

describe('getPoolUrl', () => {
	it('links humble by pool id', () => {
		expect(getPoolUrl('humble', 7, 10, 'ASA', 20, 'ARC200')).toBe(
			'https://voi.humble.sh/#/swap?poolId=7'
		);
	});

	it('returns null for Nomadex, which has shut down (TASK-88)', () => {
		expect(getPoolUrl('nomadex', 7, 10, 'ASA', 20, 'ARC200')).toBeNull();
	});

	it('returns null for an unknown exchange', () => {
		expect(getPoolUrl('other', 7, 10, 'ASA', 20, 'ARC200')).toBeNull();
	});
});
