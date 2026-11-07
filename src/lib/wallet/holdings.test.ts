import { afterEach, expect, it, vi } from 'vitest';
import type { FungibleTokenType } from '$lib/types/assets';
import {
	holdingsClaimKey,
	deriveHoldingsRows,
	deriveHoldingsDisplay,
	createHoldingsTokenLoader,
	loadWalletNfts,
	enrichWalletNfts
} from './holdings';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/services/accounts', () => ({ fetchFungibleTokens: vi.fn() }));
vi.mock('$lib/utils/envoi', () => ({
	resolveEnvoiToken: vi.fn().mockRejectedValue(new Error('names offline'))
}));

export const token = (props: Partial<FungibleTokenType> = {}): FungibleTokenType => ({
	id: '1',
	name: 'Token',
	symbol: 'TOK',
	type: 'vsa',
	balance: 1_234_567,
	decimals: 6,
	value: 12,
	usdValue: 3,
	imageUrl: '',
	verified: false,
	...props
});
const account = {
	status: 'loaded' as const,
	value: { balance: 4_000_000, minBalance: 100000, status: 'Offline', pendingRewards: 0, round: 1 }
};
const split = {
	pageAddress: 'Y',
	owner: { address: 'Y', balance: 4 },
	contracts: [],
	contractSet: 'ready' as const
};

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('converts 6- and non-6-decimal base units once; value is already VOI', () => {
	const rows = deriveHoldingsRows([token(), token({ id: '2', balance: 123, decimals: 2 })]);
	expect(rows.tokens.map((r) => r.quantity)).toEqual([1.234567, 1.23]);
	expect(rows.tokens.map((r) => r.value)).toEqual([12, 12]);
});
it('counts an LP once, excluding it from tokens, even with duplicate source entries', () => {
	const lp = token({ poolInfo: { provider: 'humble' } });
	const rows = deriveHoldingsRows([lp, lp, token({ id: '2' })]);
	expect(rows.lp).toHaveLength(1);
	expect(rows.tokens).toHaveLength(1);
	expect(
		deriveHoldingsDisplay({
			pageAddress: 'Y',
			account,
			tokens: [lp, lp, token({ id: '2' })],
			split
		}).total
	).toBe(28);
});
it('dust keeps unknown positive balances and both directions of approval; zero is reachable with Show dust', () => {
	const incoming = {
		owner: 'A',
		spender: 'Y',
		amount: '1',
		round: 1,
		timestamp: 1,
		contractId: 3,
		transactionId: 'tx'
	};
	const raw = [
		token({ id: 'unknown', value: 0 }),
		token({ id: 'in', balance: 0, value: 0, approvals: [incoming] }),
		token({ id: 'out', balance: 0, value: 0, outgoingApprovals: [incoming] }),
		token({ id: 'zero', balance: 0, value: 0 }),
		token({ id: 'dust', value: 0.1 })
	];
	expect(deriveHoldingsRows(raw).tokens.map((r) => r.token.id)).toEqual(['unknown', 'in', 'out']);
	expect(deriveHoldingsRows(raw, { showDust: true }).tokens).toHaveLength(5);
});
it('partial zero-valued nonzero balance is Unavailable, with no total or composition', () => {
	const display = deriveHoldingsDisplay({
		pageAddress: 'Y',
		account,
		tokens: [token({ value: 0 })],
		partial: true,
		split
	});
	expect(display.rows.tokens[0].value).toBeNull();
	expect(display.rows.tokens[0].valueLabel).toBe('Unavailable');
	expect(display.total).toBeNull();
	expect(display.composition).toBeNull();
});
it('incomplete tokens, contract population, or account never yields a complete total; missing USD quote stays unavailable', () => {
	for (const overrides of [
		{ partial: true },
		{ tokenState: 'error' as const },
		{ split: undefined },
		{ account: { status: 'unavailable' as const, error: 'offline' } }
	]) {
		const display = deriveHoldingsDisplay({
			pageAddress: 'Y',
			account,
			tokens: [token()],
			split,
			...overrides
		});
		expect(display.total).toBeNull();
		expect(display.composition).toBeNull();
	}
	expect(
		deriveHoldingsDisplay({ pageAddress: 'Y', account, tokens: [token()], split, price: null }).usd
	).toBeNull();
	expect(deriveHoldingsDisplay({ pageAddress: 'Z', account, tokens: [], split }).total).toBeNull();
});
const lpToken = (props: Partial<FungibleTokenType> = {}) =>
	token({ id: 'lp', value: 5, poolInfo: { provider: 'humble' }, ...props });
const parts = (display: ReturnType<typeof deriveHoldingsDisplay>) =>
	Object.fromEntries(display.parts.map((part) => [part.label, part]));
it('an unpriced regular token leaves the LP figure known and gives Tokens and other a labelled known subtotal', () => {
	const display = deriveHoldingsDisplay({
		pageAddress: 'Y',
		account,
		tokens: [lpToken(), token({ id: 'a', value: 7 }), token({ id: 'b', value: 0 })],
		split
	});
	expect(parts(display).LP.value).toBe(5);
	expect(parts(display)['Tokens and other']).toMatchObject({
		value: 7,
		note: 'Known subtotal; 1 token has no price'
	});
	expect(display.total).toBeNull();
	expect(display.composition).toBeNull();
});
it('an unpriced LP position makes the LP figure unavailable without hiding the priced tokens', () => {
	const display = deriveHoldingsDisplay({
		pageAddress: 'Y',
		account,
		tokens: [lpToken({ value: 0 }), token({ id: 'a', value: 7 })],
		split
	});
	expect(parts(display).LP.value).toBeNull();
	expect(parts(display)['Tokens and other'].value).toBe(7);
	expect(parts(display)['Tokens and other'].note).toBeUndefined();
});
it('an incomplete token source leaves LP and Tokens and other unavailable, with no subtotal', () => {
	for (const overrides of [{ partial: true }, { tokenState: 'error' as const }]) {
		const display = deriveHoldingsDisplay({
			pageAddress: 'Y',
			account,
			tokens: [lpToken(), token({ id: 'a', value: 7 }), token({ id: 'b', value: 0 })],
			split,
			...overrides
		});
		expect(parts(display).LP.value).toBeNull();
		expect(parts(display)['Tokens and other'].value).toBeNull();
		expect(parts(display)['Tokens and other'].note).toBeUndefined();
	}
});
it('frozen tokens and approval objects survive derivation untouched and by identity', () => {
	const original = token({
		poolInfo: {
			provider: 'humble',
			totalSupply: 100,
			tokABalance: '1000',
			tokBBalance: '2000',
			tokADecimals: 2,
			tokBDecimals: 3
		}
	});
	Object.freeze(original.poolInfo);
	Object.freeze(original);
	const before = JSON.stringify(original);
	const display = deriveHoldingsDisplay({ pageAddress: 'Y', account, tokens: [original], split });
	expect(display.rows.lp[0].token).toBe(original);
	expect(JSON.stringify(original)).toBe(before);
});
it('discards old address and same-address request generations before publishing the untouched service population', async () => {
	const first = Promise.withResolvers<{ tokens: FungibleTokenType[]; partial: boolean }>();
	const second = Promise.withResolvers<{ tokens: FungibleTokenType[]; partial: boolean }>();
	const fetchTokens = vi
		.fn()
		.mockReturnValueOnce(first.promise)
		.mockReturnValueOnce(second.promise);
	const load = createHoldingsTokenLoader(fetchTokens);
	const old = load('Y', 1);
	const fresh = load('Y', 2);
	const result = { tokens: [token()], partial: false };
	second.resolve(result);
	expect(await fresh).toBe(result);
	first.resolve({ tokens: [], partial: false });
	await expect(old).rejects.toThrow(/superseded/i);
	const late = Promise.withResolvers<{ tokens: FungibleTokenType[]; partial: boolean }>();
	const addressLoad = createHoldingsTokenLoader(
		vi.fn().mockReturnValueOnce(late.promise).mockResolvedValue(result)
	);
	const y = addressLoad('Y', 1);
	await addressLoad('Z', 1);
	late.resolve(result);
	await expect(y).rejects.toThrow(/superseded/i);
});
it('bounds a service read at 60 seconds and refuses malformed populations', async () => {
	vi.useFakeTimers();
	const load = createHoldingsTokenLoader(() => new Promise(() => {}));
	const pending = expect(load('Y', 0)).rejects.toThrow(/60|timed out/i);
	await vi.advanceTimersByTimeAsync(60000);
	await pending;
	const malformed = createHoldingsTokenLoader(vi.fn().mockResolvedValue({}));
	await expect(malformed('Y', 0)).rejects.toThrow(/invalid/i);
});
it('ownership survives malformed metadata and independently failed collection/enVoi enrichment', async () => {
	const fetcher = vi
		.fn()
		.mockResolvedValue(
			new Response(
				JSON.stringify({ tokens: [{ contractId: 797609, tokenId: '7', metadata: 'broken' }] })
			)
		);
	vi.stubGlobal('fetch', fetcher);
	const owned = await loadWalletNfts('NFT_FIXTURE', true);
	expect(owned).toHaveLength(1);
	expect(owned[0].name).toBe('NFT #7');
	fetcher.mockResolvedValue(new Response('', { status: 503 }));
	const enriched = await enrichWalletNfts(owned);
	expect(enriched.tokens).toHaveLength(1);
	expect(enriched.tokens[0].tokenId).toBe('7');
	expect(enriched.partial).toBe(true);
});

it.each([
	{ ...split, pageAddress: 'C', contracts: [{ address: 'C', balance: 4, details: null }] },
	{
		...split,
		pageAddress: 'C',
		contractSet: 'unavailable' as const,
		contracts: [{ address: 'C', balance: 4, details: { lockedBalance: 3000000 } }]
	},
	undefined
])('contract liquid stays unavailable until its native split is ready (%j)', (pendingSplit) => {
	const display = deriveHoldingsDisplay({
		pageAddress: 'C',
		account,
		tokens: [],
		split: pendingSplit
	});
	expect(display.parts.find((part) => part.label === 'Liquid')?.value).toBeNull();
	const ready = deriveHoldingsDisplay({
		pageAddress: 'C',
		account,
		tokens: [],
		split: {
			...split,
			pageAddress: 'C',
			contracts: [{ address: 'C', balance: 4, details: { lockedBalance: 3000000 } }]
		}
	});
	expect(ready.parts.find((part) => part.label === 'Liquid')?.value).toBe(0);
});

it('a contract page needs its own discovered contract before showing a native split', () => {
	for (const contracts of [
		[],
		[{ address: 'OTHER', balance: 4, details: { lockedBalance: 3000000 } }]
	]) {
		const display = deriveHoldingsDisplay({
			pageAddress: 'CHILD',
			parentWalletAddress: 'PARENT',
			account,
			tokens: [],
			split: { ...split, pageAddress: 'CHILD', contracts }
		});
		expect(display.parts.find((p) => p.label === 'Locked')?.value).toBeNull();
		expect(display.parts.find((p) => p.label === 'Liquid')?.value).toBeNull();
		expect(display.total).toBeNull();
		expect(display.composition).toBeNull();
	}
});

it.each([{ balance: NaN }, { decimals: 256 }, { id: 1 as unknown as string }])(
	'invalid token fields keep the original population and mark only the bad row unavailable (%j)',
	async (invalid) => {
		const tokens = [token(), token({ ...invalid, name: 'Invalid token', id: invalid.id ?? 'bad' })];
		const load = createHoldingsTokenLoader(vi.fn().mockResolvedValue({ tokens, partial: false }));
		const result = await load('Y', 1);
		expect(result.tokens).toBe(tokens);
		expect(result.partial).toBe(true);
		const display = deriveHoldingsDisplay({ pageAddress: 'Y', account, split, ...result });
		expect(display.rows.tokens).toHaveLength(2);
		expect(display.rows.tokens[0].token).toBe(tokens[0]);
		expect(display.rows.tokens[1].quantity).toBeNull();
		expect(display.rows.tokens[1].valueLabel).toBe('Unavailable');
		expect(display.total).toBeNull();
		expect(display.composition).toBeNull();
	}
);

it('a token read completing after 20 seconds still publishes', async () => {
	vi.useFakeTimers();
	const result = { tokens: [token()], partial: false };
	const load = createHoldingsTokenLoader(
		() => new Promise((resolve) => setTimeout(() => resolve(result), 20000))
	);
	const pending = load('Y', 1);
	const published = pending.then(
		(value) => ({ value }),
		(error) => ({ error })
	);
	await vi.advanceTimersByTimeAsync(20000);
	expect(await published).toEqual({ value: result });
});

it('token identity survives pool discovery and provider changes', () => {
	const key = (poolInfo?: FungibleTokenType['poolInfo']) =>
		deriveHoldingsRows([token({ poolInfo })], { pageAddress: 'Y' }).all[0].key;
	expect(key({ provider: 'humble' })).toBe(key());
	expect(key({ provider: 'humble' })).toBe(key({}));
	expect(key({ provider: 'humble' })).toBe(key({ provider: 'pact' }));
});

it('distinct source entries with the same token identity remain reachable', () => {
	const first = token();
	const second = token({ balance: 2, name: 'Another balance' });
	const rows = deriveHoldingsRows([first, { ...first }, second]);
	expect(rows.all.map((row) => row.token)).toEqual([first, second]);
	expect(new Set(rows.all.map((row) => row.key)).size).toBe(2);
	expect(rows.all[1].key).toBe(rows.all[0].key + ':1');
});

it('claim identities distinguish malformed repeats and typed ids', () => {
	const items = [NaN, NaN, 5, '5'].map((id) => ({ token: { id: id as string } }));
	const keys = items.map((_, index) => holdingsClaimKey(items, index, 'Y'));
	expect(new Set(keys).size).toBe(4);
	expect(keys[1]).toBe(keys[0] + ':1');
});

it('remembered rows survive dust filtering through both derivations', () => {
	const tokens = [token({ id: 'kept', value: 0.05 }), token({ id: 'hidden', value: 0.05 })];
	const remembered = new Set(
		deriveHoldingsRows(tokens, { pageAddress: 'Y', showDust: true })
			.all.slice(0, 1)
			.map((row) => row.key)
	);
	expect(
		deriveHoldingsRows(tokens, { pageAddress: 'Y', remembered }).tokens.map((row) => row.token.id)
	).toEqual(['kept']);
	expect(
		deriveHoldingsDisplay({ pageAddress: 'Y', account, tokens, remembered }).rows.tokens.map(
			(row) => row.token.id
		)
	).toEqual(['kept']);
	expect(deriveHoldingsRows(tokens, { pageAddress: 'Y' }).tokens).toHaveLength(0);
	expect(deriveHoldingsDisplay({ pageAddress: 'Y', account, tokens }).rows.tokens).toHaveLength(0);
});

it('typed token ids keep their keys when malformed neighbours disappear', () => {
	const valid = token();
	const malformed = token({ id: 1 as unknown as string });
	const withNeighbour = deriveHoldingsRows([malformed, valid]).all.find(
		(row) => row.token === valid
	)!;
	expect(withNeighbour.key).toBe(deriveHoldingsRows([valid]).all[0].key);
});

it('unknown ownership prevents an empty contract population from establishing Locked zero or Liquid', () => {
	const display = deriveHoldingsDisplay({
		pageAddress: 'Y',
		account,
		tokens: [],
		split: { ...split, ownerLookup: 'unavailable' }
	});
	expect(display.parts[0].value).toBeNull();
	expect(display.parts[3].value).toBeNull();
	expect(display.total).toBeNull();
	expect(display.composition).toBeNull();
});
it('an owner change for the same page cannot reuse the previous owner split', () => {
	const display = deriveHoldingsDisplay({
		pageAddress: 'C',
		parentWalletAddress: 'NEW',
		account,
		tokens: [],
		split: {
			...split,
			pageAddress: 'C',
			ownerAddress: 'OLD',
			owner: null,
			contracts: [{ address: 'C', balance: 4, details: { lockedBalance: 3e6 } }]
		}
	});
	expect(display.parts[0].value).toBeNull();
	expect(display.parts[3].value).toBeNull();
	expect(display.total).toBeNull();
});
