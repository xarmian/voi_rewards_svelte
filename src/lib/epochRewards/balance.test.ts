import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { estApr, fetchBalance } from './balance';

const addr = 'QKCTN6IX3TFNGN6LXSBNQQERXZUUXNDRTQWDTQBMHBZOTXLYJCEABU6ZX4';

test('balance reads one algod account without assets or apps and converts microVOI', async () => {
	const fetchFn = vi.fn(async () => Response.json({ address: addr, amount: 240750994658408 }));
	assert.equal(await fetchBalance(addr, fetchFn), 240750994.658408);
	assert.deepEqual(fetchFn.mock.calls, [
		[`https://mainnet-api.voi.nodely.dev/v2/accounts/${addr}?exclude=all`]
	]);
});

test('a failed or malformed algod response rejects instead of showing 0 VOI', async () => {
	await assert.rejects(fetchBalance(addr, async () => new Response('no', { status: 404 })));
	await assert.rejects(fetchBalance(addr, async () => Response.json({ address: addr })));
});

test('estimated APR annualises the full-epoch reward over the balance (52 epochs)', () => {
	assert.equal(estApr(775973.543137, 240750994.658408), 16.760314656384242);
	for (const [reward, balance] of [
		[null, 1],
		[1, null],
		[1, 0],
		[1, Number.NaN]
	] as const)
		assert.equal(estApr(reward, balance), null);
});
