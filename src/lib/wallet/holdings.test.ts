import { afterEach, expect, it, vi } from 'vitest';
import type { FungibleTokenType } from '$lib/types/assets';
import {
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
it('raw zero, never rounded zero, determines Opt-out reachability without changing money objects', () => {
	const raw = [
		token({ balance: 1, value: 0 }),
		token({ id: 'zero', balance: 0, value: 0 }),
		token({ id: 'arc', type: 'arc200', balance: 0, value: 0 })
	];
	const rows = deriveHoldingsRows(raw, { showDust: true }).tokens;
	expect(rows.map((r) => r.canOptOut)).toEqual([false, true, false]);
	expect(rows[0].token).toBe(raw[0]);
	expect(rows[0].token.balance).toBe(1);
});
it('D4: partial zero-valued nonzero balance is Unavailable, with no total or composition', () => {
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
it('bounds a service read at 15 seconds and refuses malformed populations', async () => {
	vi.useFakeTimers();
	const load = createHoldingsTokenLoader(() => new Promise(() => {}));
	const pending = expect(load('Y', 0)).rejects.toThrow(/15|timed out/i);
	await vi.advanceTimersByTimeAsync(15000);
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
