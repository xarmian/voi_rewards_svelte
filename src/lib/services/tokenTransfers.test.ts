import { ABIType } from 'algosdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FungibleTokenType, LPToken } from '$lib/types/assets';
import { algodClient, algodIndexer } from '$lib/utils/algod';
import { getEnvoiNames } from '$lib/utils/envoi';
import { fetchTokenTransfers, fetchCurrentPoolBalance } from './tokenTransfers';

vi.mock('$lib/utils/algod', () => ({
	algodClient: { getApplicationByID: vi.fn() },
	algodIndexer: { searchForTransactions: vi.fn(), lookupTransactionByID: vi.fn() }
}));
vi.mock('$lib/utils/envoi', () => ({ getEnvoiNames: vi.fn() }));
const token: FungibleTokenType = {
	id: '1',
	name: 'Token',
	symbol: 'T',
	balance: 100,
	decimals: 2,
	verified: true,
	imageUrl: '',
	value: 0,
	type: 'native'
};
const lp: LPToken = {
	...token,
	contractId: '1',
	type: 'arc200',
	poolInfo: {
		tokAId: '2',
		tokBId: '3',
		tokASymbol: 'A',
		tokBSymbol: 'B',
		tokABalance: '10000',
		tokBBalance: '20000',
		totalSupply: 1000,
		poolId: '4',
		apr: 0,
		tokADecimals: 2,
		tokBDecimals: 2,
		tvl: 0,
		provider: 'nomadex'
	}
};
const transaction = {
	sender: 'wallet',
	'confirmed-round': 10,
	id: 'tx',
	'round-time': 20,
	fee: 1,
	note: Buffer.from('memo').toString('base64')
};
const arcTransfer = {
	from: 'other',
	to: 'wallet',
	amount: '200',
	round: 10,
	transactionid: 'tx',
	timestamp: 20
};
const fetchMock = vi.fn<typeof fetch>();
const query = {
	address: vi.fn().mockReturnThis(),
	assetID: vi.fn().mockReturnThis(),
	limit: vi.fn().mockReturnThis(),
	nextToken: vi.fn().mockReturnThis(),
	do: vi.fn()
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal('fetch', fetchMock);
	vi.mocked(algodIndexer.searchForTransactions).mockReturnValue(
		query as unknown as ReturnType<typeof algodIndexer.searchForTransactions>
	);
	vi.mocked(getEnvoiNames).mockResolvedValue([
		{ address: 'wallet', name: 'wallet.voi', metadata: {}, cached: true }
	]);
});
afterEach(() => vi.unstubAllGlobals());

// Characterization of the moved branches. Every upstream is stubbed.
describe('fetchTokenTransfers', () => {
	it('normalizes native payments, inner payments and standalone fees and enriches names', async () => {
		query.do.mockResolvedValue({
			transactions: [
				{
					...transaction,
					'tx-type': 'pay',
					'payment-transaction': { receiver: 'other', amount: 200 },
					'inner-txns': [
						{
							id: 'inner',
							sender: 'other',
							'tx-type': 'pay',
							'payment-transaction': { receiver: 'wallet', amount: 50 }
						}
					]
				},
				{ ...transaction, id: 'app', 'tx-type': 'appl' }
			]
		});
		const result = await fetchTokenTransfers({
			token,
			walletId: 'wallet',
			nextToken: 'cursor',
			append: true,
			limit: 50
		});
		expect(query.nextToken).toHaveBeenCalledWith('cursor');
		expect(result.hasMore).toBe(false);
		// The native branch retains the previous token when it reaches the end.
		expect(result.nextToken).toBe('cursor');
		expect(result.transfers).toMatchObject([
			{ amount: '2', type: 'payment', note: 'memo', from_name: 'wallet.voi' },
			{ amount: '0.5', type: 'inner-payment', parentTxId: 'tx', to_name: 'wallet.voi' },
			{ amount: '0.01', type: 'fee', to_name: 'Fee Sink' }
		]);
	});
	it('passes through VSA pagination and scales asset transfers', async () => {
		query.do.mockResolvedValue({
			'next-token': 'next',
			transactions: [
				{
					...transaction,
					'tx-type': 'axfer',
					'asset-transfer-transaction': { receiver: 'other', amount: 300 }
				}
			]
		});
		const result = await fetchTokenTransfers({
			token: { ...token, type: 'vsa' },
			walletId: 'wallet',
			append: true,
			nextToken: 'cursor'
		});
		expect(query.assetID).toHaveBeenCalledWith(1);
		expect(query.nextToken).toHaveBeenCalledWith('cursor');
		expect(result).toMatchObject({
			nextToken: 'next',
			hasMore: true,
			transfers: [{ amount: '3', note: 'memo' }]
		});
	});
	it('uses ARC200 offset pagination and includes previous senders in name enrichment', async () => {
		fetchMock.mockResolvedValue(Response.json({ data: [arcTransfer] }));
		const result = await fetchTokenTransfers({
			token: { ...token, type: 'arc200' },
			walletId: 'wallet',
			offset: 50,
			limit: 1,
			transfers: [{ ...arcTransfer, from: 'previous' }]
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/mimir?action=get_arc200_transfers&p_contractid=1&p_user=wallet&p_limit=1&p_offset=50'
		);
		expect(result).toMatchObject({
			hasMore: true,
			transfers: [{ amount: '2', to_name: 'wallet.voi' }]
		});
		expect(getEnvoiNames).toHaveBeenCalledWith(['previous', 'other', 'wallet']);
	});
	it('enriches an LP transfer from its Deposit log', async () => {
		fetchMock.mockResolvedValue(Response.json({ data: [arcTransfer] }));
		const deposit = Buffer.concat([
			Buffer.from('73d468a3', 'hex'),
			ABIType.from('(address,(uint256,uint256),uint256,(uint256,uint256))').encode([
				'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
				[100n, 200n],
				5n,
				[1000n, 2000n]
			])
		]);
		vi.mocked(algodIndexer.lookupTransactionByID).mockReturnValue({
			do: vi.fn().mockResolvedValue({ transaction: { logs: [deposit.toString('base64')] } })
		} as unknown as ReturnType<typeof algodIndexer.lookupTransactionByID>);
		const result = await fetchTokenTransfers({ token: lp, walletId: 'wallet' });
		expect(result.transfers[0]).toMatchObject({
			isLpExchange: true,
			lpExchangeType: 'add',
			exchangedTokens: { tokenA: { amount: '1.00' }, tokenB: { amount: '2.00' } }
		});
	});
	it.each(['native', 'arc200', 'vsa'] as const)(
		'returns an empty %s page without appending and clears hasMore',
		async (type) => {
			query.do.mockResolvedValue({
				transactions: [],
				'next-token': type === 'native' ? undefined : 'next'
			});
			fetchMock.mockResolvedValue(Response.json({ data: [] }));
			const previous = [{ ...arcTransfer }];
			const result = await fetchTokenTransfers({
				token: { ...token, type },
				walletId: 'wallet',
				append: true,
				transfers: previous
			});
			expect(result.transfers).toEqual([]);
			expect(previous).toEqual([arcTransfer]);
			expect(result.hasMore).toBe(false);
			expect(getEnvoiNames).not.toHaveBeenCalled();
		}
	);
});

describe('fetchCurrentPoolBalance', () => {
	it('returns the existing synchronous pool fallback in decimal form', () => {
		expect(fetchCurrentPoolBalance(lp, null)).toEqual({ tokenA: 10, tokenB: 20 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('returns Humble balances from base-unit reserves, like Nomadex (TASK-97)', () => {
		expect(
			fetchCurrentPoolBalance({ ...lp, poolInfo: { ...lp.poolInfo, provider: 'humble' } }, null)
		).toEqual({ tokenA: 10, tokenB: 20 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('Humble LP transfers (TASK-97)', () => {
	// The Deposit event lists amounts in the contract's token order. Mimir's order is
	// arbitrary per pool: live 2026-10-30, 24 of 30 Humble pools were reversed.
	const deposit = Buffer.concat([
		Buffer.from('73d468a3', 'hex'),
		ABIType.from('(address,(uint256,uint256),uint256,(uint256,uint256))').encode([
			'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
			[1875n, 8888626604n],
			5n,
			[1000n, 2000n]
		])
	]);
	const humble: LPToken = {
		...lp,
		poolInfo: {
			...lp.poolInfo,
			provider: 'humble',
			poolId: '40180060',
			tokAId: '0',
			tokBId: '40153368',
			tokASymbol: 'VOI',
			tokBSymbol: 'aBTC',
			tokADecimals: 6,
			tokBDecimals: 8
		}
	};
	function contractOrder(tokA: number, tokB: number) {
		const state = Buffer.alloc(16);
		state.writeBigUInt64BE(BigInt(tokA), 0);
		state.writeBigUInt64BE(BigInt(tokB), 8);
		vi.mocked(algodClient.getApplicationByID).mockReturnValue({
			do: vi.fn().mockResolvedValue({
				params: {
					'global-state': [
						{ key: Buffer.from([0]).toString('base64'), value: { bytes: state.toString('base64') } }
					]
				}
			})
		} as unknown as ReturnType<typeof algodClient.getApplicationByID>);
	}
	beforeEach(() => {
		fetchMock.mockResolvedValue(Response.json({ data: [arcTransfer] }));
		vi.mocked(algodIndexer.lookupTransactionByID).mockReturnValue({
			do: vi.fn().mockResolvedValue({ transaction: { logs: [deposit.toString('base64')] } })
		} as unknown as ReturnType<typeof algodIndexer.lookupTransactionByID>);
	});

	it('labels the amounts by the contract order when it is the reverse of the pool info', async () => {
		contractOrder(40153368, 390001);
		const result = await fetchTokenTransfers({ token: humble, walletId: 'wallet' });
		expect(result.transfers[0].exchangedTokens).toMatchObject({
			tokenA: { symbol: 'VOI', amount: '8888.626604' },
			tokenB: { symbol: 'aBTC', amount: '0.00001875' }
		});
		expect(algodClient.getApplicationByID).toHaveBeenCalledWith(40180060);
	});
	it('keeps the order when the contract order matches', async () => {
		contractOrder(390001, 40153368);
		const result = await fetchTokenTransfers({
			token: {
				...humble,
				poolInfo: {
					...humble.poolInfo,
					tokADecimals: 8,
					tokBDecimals: 6,
					tokASymbol: 'X',
					tokBSymbol: 'Y'
				}
			},
			walletId: 'wallet'
		});
		expect(result.transfers[0].exchangedTokens).toMatchObject({
			tokenA: { amount: '0.00001875' },
			tokenB: { amount: '8888.626604' }
		});
	});
	it('shows Unknown amounts when the contract order cannot be read', async () => {
		vi.mocked(algodClient.getApplicationByID).mockReturnValue({
			do: vi.fn().mockRejectedValue(new Error('algod down'))
		} as unknown as ReturnType<typeof algodClient.getApplicationByID>);
		const result = await fetchTokenTransfers({ token: humble, walletId: 'wallet' });
		expect(result.transfers[0]).toMatchObject({
			isLpExchange: true,
			lpExchangeType: 'add',
			exchangedTokens: { tokenA: { amount: 'Unknown' }, tokenB: { amount: 'Unknown' } }
		});
	});
});
