// Synthetic assets shared only by the browser fixture and its read boundaries.
import type { FungibleTokenType } from '$lib/types/assets';
const approval = {
	owner: 'OWNER',
	spender: 'Y',
	amount: '1000000',
	timestamp: 1,
	round: 1,
	contractId: 1,
	transactionId: 'tx'
};
export const tokens: FungibleTokenType[] = Array.from({ length: 14 }, (_, i) => ({
	id: String(i + 1),
	name: `Asset ${i + 1}`,
	symbol: `T${i + 1}`,
	type: 'arc200',
	balance: 1000000,
	decimals: 6,
	value: 20 - i,
	usdValue: 1,
	imageUrl: '/icons/default-token-image.svg',
	verified: false,
	approvals: [{ ...approval, contractId: i + 1 }]
}));
tokens.push({
	...tokens[0],
	id: 'zero',
	name: 'Zero VSA',
	type: 'vsa',
	balance: 0,
	value: 0,
	approvals: []
});
tokens.push({
	...tokens[0],
	id: 'tiny',
	name: 'Tiny VSA',
	type: 'vsa',
	balance: 1,
	value: 0,
	approvals: []
});
tokens.push({
	...tokens[0],
	id: 'lp',
	name: 'Pool pair',
	symbol: 'A/B',
	poolId: '123',
	poolInfo: {
		provider: 'humble',
		apr: 12,
		totalSupply: 1000000000,
		tokABalance: '4000000',
		tokBBalance: '60000',
		tokADecimals: 6,
		tokBDecimals: 2,
		tokAId: '4',
		tokBId: '5',
		tokASymbol: 'A',
		tokBSymbol: 'B'
	}
});

tokens.push({
	...tokens[tokens.length - 1],
	id: 'lp-zero',
	name: 'Pool without APR',
	approvals: [],
	poolInfo: { ...tokens[tokens.length - 1].poolInfo, apr: 0 }
});
