import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mimirClient as supabaseMimirClient } from '$lib/mimir';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('$lib/mimir', () => ({ mimirClient: { from: mocks.from } }));

// These private helpers are copied verbatim from the three routes at 19f29dd,
// with only the two conflicting function names changed. Keep their different
// inclusion, ordering, duplicate and failure behavior until a product decision
// authorizes unification. Production modules remain untouched.
interface TokenEquivalents {
	tokenId: number;
	equivalents: number[];
	failed: boolean;
}

// The original routes use an untyped Mimir client (no generated schema).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MimirClient = SupabaseClient<any, any, any>;

async function getTokenInfoEquivalents(
	tokenId: number
): Promise<{ value: number[]; failed: boolean }> {
	try {
		const { data, error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('contract_id, token_id')
			.or(`contract_id.eq.${tokenId},token_id.eq.${tokenId}`);

		if (error || !data || data.length === 0) {
			return { value: [], failed: !!error && error.code !== 'PGRST116' };
		}

		const equivalents: number[] = [];
		data.forEach((row) => {
			// Add the contract_id (ARC200 token) if different from input
			if (row.contract_id !== tokenId) {
				equivalents.push(row.contract_id);
			}

			// Add the token_id (ASA/native token) if it exists and contains no comma
			if (row.token_id && typeof row.token_id === 'string' && !row.token_id.includes(',')) {
				const equivalentId = parseInt(row.token_id, 10);
				if (!isNaN(equivalentId) && equivalentId !== tokenId) {
					equivalents.push(equivalentId);
				}
			}
		});

		return { value: equivalents, failed: false };
	} catch (error) {
		console.error('Failed to get token equivalents:', error);
		return { value: [], failed: true };
	}
}

async function getTokenAnalyticsEquivalents(tokenId: number): Promise<TokenEquivalents> {
	try {
		// Query arc200_contracts to find equivalent tokens
		const { data, error } = await supabaseMimirClient
			.from('arc200_contracts')
			.select('contract_id, token_id')
			.or(`contract_id.eq.${tokenId},token_id.eq.${tokenId}`);

		if (error) {
			console.error('Error fetching token equivalents:', error);
			return { tokenId, equivalents: [], failed: true };
		}

		if (!data || data.length === 0) {
			return { tokenId, equivalents: [], failed: false };
		}

		// Extract all equivalent IDs
		const equivalents: number[] = [];
		data.forEach((row) => {
			// Add the contract_id (ARC200 token)
			if (row.contract_id !== tokenId) {
				equivalents.push(row.contract_id);
			}

			// Add the token_id (ASA/native token) if it exists and contains no comma
			if (row.token_id && typeof row.token_id === 'string' && !row.token_id.includes(',')) {
				const equivalentId = parseInt(row.token_id, 10);
				if (!isNaN(equivalentId) && equivalentId !== tokenId) {
					equivalents.push(equivalentId);
				}
			}
		});

		return { tokenId, equivalents, failed: false };
	} catch (error) {
		console.error('Failed to get token equivalents:', error);
		return { tokenId, equivalents: [], failed: true };
	}
}

async function getTokenEquivalentIds(
	tokenId: number,
	supabaseMimirClient: MimirClient,
	onFailure: () => void
): Promise<number[]> {
	const ids = new Set<number>([tokenId]);

	// Query arc200_contracts for mappings in both directions
	const { data, error } = await supabaseMimirClient
		.from('arc200_contracts')
		.select('contract_id, token_id')
		.or(`contract_id.eq.${tokenId},token_id.eq.${tokenId}`);

	if (error) onFailure();
	if (data) {
		for (const row of data) {
			ids.add(row.contract_id);
			// Only add token_id if it's a single number (not a pool's comma-separated pair)
			if (row.token_id && !row.token_id.includes(',')) {
				const parsed = parseInt(row.token_id, 10);
				if (!isNaN(parsed)) ids.add(parsed);
			}
		}
	}

	return Array.from(ids);
}

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

function mockQuery(data: typeof rows | null, error: { code: string } | null = null) {
	const or = vi.fn().mockResolvedValue({ data, error });
	const select = vi.fn().mockReturnValue({ or });
	mocks.from.mockReturnValue({ select });
	return { select, or };
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('TASK-34 token-equivalence characterization before extraction', () => {
	it('token-info excludes self and preserves duplicate IDs in row order', async () => {
		const query = mockQuery(rows);
		expect(await getTokenInfoEquivalents(tokenId)).toEqual({
			value: [456, 789, 456, 789, 234],
			failed: false
		});
		expect(mocks.from).toHaveBeenCalledWith('arc200_contracts');
		expect(query.select).toHaveBeenCalledWith('contract_id, token_id');
		expect(query.or).toHaveBeenCalledWith('contract_id.eq.123,token_id.eq.123');
	});

	it('token-analytics excludes self and preserves duplicate IDs in row order', async () => {
		const query = mockQuery(rows);
		expect(await getTokenAnalyticsEquivalents(tokenId)).toEqual({
			tokenId,
			equivalents: [456, 789, 456, 789, 234],
			failed: false
		});
		expect(mocks.from).toHaveBeenCalledWith('arc200_contracts');
		expect(query.select).toHaveBeenCalledWith('contract_id, token_id');
		expect(query.or).toHaveBeenCalledWith('contract_id.eq.123,token_id.eq.123');
	});

	it('markets prepends self and deduplicates IDs in first-seen order', async () => {
		const query = mockQuery(rows);
		const onFailure = vi.fn();
		expect(await getTokenEquivalentIds(tokenId, supabaseMimirClient, onFailure)).toEqual([
			123, 456, 789, 234
		]);
		expect(onFailure).not.toHaveBeenCalled();
		expect(mocks.from).toHaveBeenCalledWith('arc200_contracts');
		expect(query.select).toHaveBeenCalledWith('contract_id, token_id');
		expect(query.or).toHaveBeenCalledWith('contract_id.eq.123,token_id.eq.123');
	});

	it.each([[], null])(
		'retains the different self-inclusion rule for empty data %j',
		async (data) => {
			mockQuery(data);
			const onFailure = vi.fn();
			expect(await getTokenInfoEquivalents(tokenId)).toEqual({ value: [], failed: false });
			expect(await getTokenAnalyticsEquivalents(tokenId)).toEqual({
				tokenId,
				equivalents: [],
				failed: false
			});
			expect(await getTokenEquivalentIds(tokenId, supabaseMimirClient, onFailure)).toEqual([123]);
			expect(onFailure).not.toHaveBeenCalled();
		}
	);

	it.each(['XX000', 'PGRST116'])('preserves failure handling for query error %s', async (code) => {
		mockQuery(null, { code });
		const onFailure = vi.fn();
		expect(await getTokenInfoEquivalents(tokenId)).toEqual({
			value: [],
			failed: code !== 'PGRST116'
		});
		expect(await getTokenAnalyticsEquivalents(tokenId)).toEqual({
			tokenId,
			equivalents: [],
			failed: true
		});
		expect(await getTokenEquivalentIds(tokenId, supabaseMimirClient, onFailure)).toEqual([123]);
		expect(onFailure).toHaveBeenCalledTimes(1);
	});
});
