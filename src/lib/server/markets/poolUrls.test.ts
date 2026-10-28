import { describe, expect, it } from 'vitest';
import { getPoolUrl } from './poolUrls';

describe('getPoolUrl', () => {
	it('links humble by pool id', () => {
		expect(getPoolUrl('humble', 7, 10, 'ASA', 20, 'ARC200')).toBe(
			'https://voi.humble.sh/#/swap?poolId=7'
		);
	});

	it.each([
		['voi', 0],
		['ASA', 1],
		['ARC200', 2],
		['unknown', 2]
	] as const)('uses Nomadex type %s on either side', (type, code) => {
		expect(getPoolUrl('nomadex', 7, 10, type, 20, 'ASA')).toBe(
			`https://voi.nomadex.app/${code}/10/1/20`
		);
		expect(getPoolUrl('nomadex', 7, 10, 'ARC200', 20, type)).toBe(
			`https://voi.nomadex.app/2/10/${code}/20`
		);
	});

	it('returns null for an unknown exchange', () => {
		expect(getPoolUrl('other', 7, 10, 'ASA', 20, 'ARC200')).toBeNull();
	});
});
