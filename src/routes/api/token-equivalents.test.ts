import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTokenEquivalents, type MimirClient } from '$lib/tokens/equivalents';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('$lib/mimir', () => ({ mimirClient: { from: mocks.from } }));

const tokenId = 123;
// The query can match either column. Include repeated rows, self mappings,
// comma-separated pool IDs and absent token IDs, in database-returned order.
const rows = [
	{ contract_id: tokenId, token_id: '456' },
	{ contract_id: 789, token_id: '123' },
	{ contract_id: tokenId, token_id: '456' },
	{ contract_id: 789, token_id: '123' },
	{ contract_id: tokenId, token_id: '123' },
	{ contract_id: tokenId, token_id: '12,34' },
	{ contract_id: tokenId, token_id: null },
	{ contract_id: tokenId, token_id: '234' }
];

function mockQuery(
	data: { contract_id: number; token_id: string | number | null }[] | null,
	error: { code: string } | null = null
) {
	const or = vi.fn().mockResolvedValue({ data, error });
	const builder = { or, abortSignal: () => builder };
	const select = vi.fn().mockReturnValue(builder);
	mocks.from.mockReturnValue({ select });
	return { select, or };
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('TASK-60 canonical token equivalents', () => {
	it('excludes self and deduplicates IDs in first-seen row order', async () => {
		const query = mockQuery(rows);
		const result = getTokenEquivalents(tokenId);
		expect(mocks.from).toHaveBeenCalledWith('arc200_contracts');
		expect(query.select).toHaveBeenCalledWith('contract_id, token_id');
		expect(query.or).toHaveBeenCalledWith('contract_id.eq.123,token_id.eq.123');
		expect(await result).toEqual({ ids: [456, 789, 234], failed: false });
	});

	it('preserves the markets composition with self first', async () => {
		mockQuery(rows);
		const { ids } = await getTokenEquivalents(tokenId);
		expect([tokenId, ...ids]).toEqual([123, 456, 789, 234]);
	});

	it('visits contract_id before token_id within each row', async () => {
		mockQuery([
			{ contract_id: 789, token_id: '456' },
			{ contract_id: 456, token_id: '234' }
		]);
		expect(await getTokenEquivalents(tokenId)).toEqual({ ids: [789, 456, 234], failed: false });
	});

	it.each([[], null])('treats empty data %j as a successful lookup', async (data) => {
		mockQuery(data);
		const result = await getTokenEquivalents(tokenId);
		expect(result).toEqual({ ids: [], failed: false });
		expect([tokenId, ...result.ids]).toEqual([123]);
		expect(console.error).not.toHaveBeenCalled();
	});

	it.each(['XX000', 'PGRST116'])('marks query error %s failed and logs it once', async (code) => {
		const error = { code };
		mockQuery(rows, error);
		expect(await getTokenEquivalents(tokenId)).toEqual({ ids: [], failed: true });
		expect(console.error).toHaveBeenCalledTimes(1);
		expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
	});

	it('catches a thrown from() error and logs it once', async () => {
		const error = new Error('equivalents unavailable');
		mocks.from.mockImplementation(() => {
			throw error;
		});
		expect(await getTokenEquivalents(tokenId)).toEqual({ ids: [], failed: true });
		expect(console.error).toHaveBeenCalledTimes(1);
		expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
	});

	it('skips numeric token_id values and strings that do not parse to a finite number', async () => {
		mockQuery([
			{ contract_id: tokenId, token_id: 456 },
			{ contract_id: tokenId, token_id: 'invalid' },
			{ contract_id: tokenId, token_id: '9'.repeat(400) }
		]);
		expect(await getTokenEquivalents(tokenId)).toEqual({ ids: [], failed: false });
	});

	it('includes token_id zero for a nonzero token', async () => {
		mockQuery([{ contract_id: 456, token_id: '0' }]);
		expect(await getTokenEquivalents(456)).toEqual({ ids: [0], failed: false });
	});

	it('excludes token_id zero when zero is self', async () => {
		mockQuery([{ contract_id: 390001, token_id: '0' }]);
		expect(await getTokenEquivalents(0)).toEqual({ ids: [390001], failed: false });
	});

	it('uses an explicit client instead of the shared default', async () => {
		const query = mockQuery(rows);
		const from = vi.fn().mockReturnValue({ select: query.select });
		const client = { from } as unknown as MimirClient;
		expect(await getTokenEquivalents(tokenId, client)).toEqual({
			ids: [456, 789, 234],
			failed: false
		});
		expect(from).toHaveBeenCalledWith('arc200_contracts');
		expect(query.select).toHaveBeenCalledWith('contract_id, token_id');
		expect(query.or).toHaveBeenCalledWith('contract_id.eq.123,token_id.eq.123');
		expect(mocks.from).not.toHaveBeenCalled();
	});
});
