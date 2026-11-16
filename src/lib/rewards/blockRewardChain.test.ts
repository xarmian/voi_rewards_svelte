import { describe, expect, it, vi } from 'vitest';
import { FEE_SINK_ADDRESS } from './blockRewardConstants';
import {
	readBonus,
	readFeeSink,
	readLastRound,
	readOnlineStake,
	type ChainClients
} from './blockRewardChain';

vi.mock('$lib/utils/algod', () => ({ algodClient: {}, algodIndexer: {} }));

const notFound = () =>
	Object.assign(new Error('Network request error. Received status 404'), {
		response: { status: 404 }
	});

function fakes(
	options: {
		health?: unknown;
		blocks?: (round: number) => unknown;
		supply?: unknown;
		account?: unknown;
		status?: unknown;
	} = {}
) {
	const lookupBlock = vi.fn((round: number | bigint) => {
		const request = { headerOnly: vi.fn(() => request), do: vi.fn() };
		request.do.mockImplementation(async () => {
			const block = (options.blocks ?? (() => ({ bonus: 5_000_000 })))(Number(round));
			if (block instanceof Error) throw block;
			return block;
		});
		return request;
	});
	const exclude = vi.fn();
	const accountInformation = vi.fn(() => {
		const request = { exclude, do: vi.fn(async () => options.account) };
		exclude.mockReturnValue(request);
		return request;
	});
	const getSupplyInfo = vi.fn();
	const clients = {
		algod: {
			supply: vi.fn(() => ({ do: vi.fn(async () => options.supply) })),
			accountInformation,
			status: vi.fn(() => ({ do: vi.fn(async () => options.status) })),
			getSupplyInfo
		},
		indexer: {
			makeHealthCheck: vi.fn(() => ({
				do: vi.fn(async () => options.health ?? { round: 30_000_000n })
			})),
			lookupBlock
		}
	};
	return { clients: clients as unknown as ChainClients, lookupBlock, exclude, getSupplyInfo };
}

describe('readBonus', () => {
	it('reads the bonus at the indexer round', async () => {
		const { clients, lookupBlock } = fakes();
		await expect(readBonus(clients)).resolves.toEqual({ bonus: 5_000_000, round: 30_000_000 });
		expect(Number(lookupBlock.mock.calls[0][0])).toBe(30_000_000);
		expect(lookupBlock.mock.results[0].value.headerOnly).toHaveBeenCalledWith(true);
	});

	it('accepts a bigint bonus', async () => {
		const { clients } = fakes({ blocks: () => ({ bonus: 4_950_000n }) });
		await expect(readBonus(clients)).resolves.toEqual({ bonus: 4_950_000, round: 30_000_000 });
	});

	it('retries once five rounds back after a 404', async () => {
		const { clients, lookupBlock } = fakes({
			blocks: (round) => (round === 30_000_000 ? notFound() : { bonus: 4_000_000 })
		});
		await expect(readBonus(clients)).resolves.toEqual({ bonus: 4_000_000, round: 29_999_995 });
		expect(lookupBlock.mock.calls.map((call) => Number(call[0]))).toEqual([30_000_000, 29_999_995]);
	});

	it('accepts a status directly on the error', async () => {
		const { clients } = fakes({
			blocks: (round) =>
				round === 30_000_000
					? Object.assign(new Error('missing'), { status: 404 })
					: { bonus: 4_000_000 }
		});
		await expect(readBonus(clients)).resolves.toMatchObject({ round: 29_999_995 });
	});

	it('throws after a second 404', async () => {
		const { clients, lookupBlock } = fakes({ blocks: () => notFound() });
		await expect(readBonus(clients)).rejects.toThrow();
		expect(lookupBlock).toHaveBeenCalledTimes(2);
	});

	it('does not retry other errors', async () => {
		const { clients, lookupBlock } = fakes({ blocks: () => new Error('boom') });
		await expect(readBonus(clients)).rejects.toThrow('boom');
		expect(lookupBlock).toHaveBeenCalledTimes(1);
	});

	it('throws on a missing or invalid bonus', async () => {
		for (const block of [{}, { bonus: 0 }, { bonus: -1 }, { bonus: 1.5 }, { bonus: 'x' }])
			await expect(readBonus(fakes({ blocks: () => block }).clients)).rejects.toThrow();
	});
});

describe('readOnlineStake', () => {
	it('reads onlineMoney without getSupplyInfo', async () => {
		const { clients, getSupplyInfo } = fakes({ supply: { onlineMoney: 739_560_000_000_000n } });
		await expect(readOnlineStake(clients)).resolves.toBe(739_560_000_000_000);
		expect(getSupplyInfo).not.toHaveBeenCalled();
	});

	it('throws on a bad value', async () => {
		for (const supply of [{}, { onlineMoney: 0n }, { onlineMoney: 2n ** 60n }, null])
			await expect(readOnlineStake(fakes({ supply }).clients)).rejects.toThrow();
	});
});

describe('readFeeSink', () => {
	it('reads amount and minBalance of the fee sink', async () => {
		const { clients, exclude } = fakes({ account: { amount: 9_000_000n, minBalance: 100_000n } });
		await expect(readFeeSink(clients)).resolves.toEqual({ amount: 9_000_000, minBalance: 100_000 });
		expect(clients.algod.accountInformation).toHaveBeenCalledWith(FEE_SINK_ADDRESS);
		expect(exclude).toHaveBeenCalledWith('all');
	});

	it('throws on bad values', async () => {
		for (const account of [
			{},
			{ amount: -1n, minBalance: 0n },
			{ amount: 1n },
			{ amount: 1.5, minBalance: 0 },
			{ amount: 2n ** 60n, minBalance: 0n },
			null
		])
			await expect(readFeeSink(fakes({ account }).clients)).rejects.toThrow();
	});
});

describe('readLastRound', () => {
	it('reads the algod last round', async () => {
		await expect(
			readLastRound(fakes({ status: { lastRound: 30_000_123n } }).clients)
		).resolves.toBe(30_000_123);
	});

	it('throws on a bad value', async () => {
		await expect(readLastRound(fakes({ status: {} }).clients)).rejects.toThrow();
	});
});
