import { describe, expect, it } from 'vitest';
import { summarizeWallet, type WalletAccount, type WalletEpoch } from './summary';

const owner: WalletAccount = {
	address: 'OWNER',
	balance: 113,
	isParticipating: false,
	contractId: 0,
	voteLastValid: null,
	round: 100,
	lastVoteAt: null,
	lastBlock: null
};
const epoch: WalletEpoch = {
	epoch: 104,
	networkBlocks: 100000,
	onlineStake: 1000000,
	pool: 2000000,
	progress: 0.5,
	blocks: { C0: 1060, C1: 1060, C2: 1060 }
};
const online = (address: string): WalletAccount => ({
	...owner,
	address,
	contractId: 1,
	balance: 10000,
	isParticipating: true,
	voteLastValid: 100 + (86400 * 304) / 2.8,
	lastVoteAt: '2026-10-25T00:00:00Z',
	lastBlock: 99
});
const summarize = (contracts: WalletAccount[], current = epoch, primary = owner) =>
	summarizeWallet({
		owner: primary,
		contracts,
		current,
		history: [],
		state: 'ready',
		now: Date.parse('2026-10-25T00:00:00Z')
	});

describe('owner and contracts roll-up', () => {
	it('offline owner with 16 contracts counts only the three online balances as current stake', () => {
		const contracts = Array.from({ length: 16 }, (_, i) => ({
			...online(`C${i}`),
			contractId: i + 1,
			isParticipating: i < 3
		}));
		const result = summarize(contracts);
		expect(result.contractCount).toBe(16);
		expect(result.onlineContracts).toBe(3);
		expect(result.stakedOnline).toBe(30000);
		expect(result.idleBalance).toBe(130000);
		expect(result.current.blocks).toBe(3180);
		expect(result.current.expected).toBe(3000);
		expect(result.current.ratio).toBeCloseTo(1.06);
		expect(result.current.reward).toBe(31800);
	});
	it('an account with no contracts still counts its own online stake and blocks once', () => {
		const result = summarize([], { ...epoch, blocks: { OWNER: 1050 } }, online('OWNER'));
		expect(result.contractCount).toBe(0);
		expect(result.onlineAccounts).toBe(1);
		expect(result.current.expected).toBe(1000);
		expect(result.current.blocks).toBe(1050);
	});
	it('an expired key is dangerous even while algod still marks the account online', () => {
		const result = summarize([{ ...online('C0'), voteLastValid: 99 }]);
		expect(result.keyTone).toBe('danger');
		expect(result.keyDays).toBeLessThan(0);
	});
	it('early epochs suppress projections and never divide by zero', () => {
		const early = summarize([online('C0')], {
			...epoch,
			networkBlocks: 10,
			blocks: {},
			progress: 0.001
		});
		expect(early.tooEarly).toBe(true);
		expect(early.current.reward).toBeNull();
		const empty = summarize([online('C0')], {
			...epoch,
			networkBlocks: 0,
			blocks: {},
			progress: 0
		});
		expect(empty.current.ratio).toBeNull();
		expect(empty.current.reward).toBeNull();
	});
	it('only complete epochs enter the historical luck and reward totals', () => {
		const result = summarizeWallet({
			owner,
			contracts: [online('C0')],
			current: epoch,
			history: [{ ...epoch, epoch: 103, progress: 1 }, epoch],
			state: 'ready',
			now: Date.parse('2026-10-25T00:00:00Z')
		});
		expect(result.history).toHaveLength(1);
		expect(result.history[0].expected).toBe(1000);
		expect(result.earnedHistory).toBe(21200);
		expect(result.historyRatio).toBeCloseTo(1.06);
	});
});

it('drained contracts do not count as idle or warn an otherwise healthy owner', () => {
	const drained = { ...owner, address: 'DRAINED', balance: 0.1 };
	const result = summarize([drained], epoch, online('OWNER'));
	expect(result.idleCount).toBe(0);
	expect(result.idleBalance).toBe(0);
	expect(result.healthTone).toBe('ok');
	const funded = summarize([{ ...drained, balance: 5 }]);
	expect(funded.idleCount).toBe(1);
	expect(funded.idleBalance).toBe(5);
});

it('buckets vesting-start years by the loader rule (first window, then funding year) and caps bars at the Locked total', () => {
	const contract = {
		...online('C0'),
		balance: 5,
		details: {
			fundingTime: Date.parse('2026-12-31T00:00:00Z') / 1000,
			lockupPeriod: 0,
			vestingDelay: 2,
			periodSeconds: 86400,
			lockedBalance: 10e6,
			availableForWithdrawal: 0,
			nextVestingDate: null
		}
	} as WalletAccount;
	// Still inside its first window at the test clock: vesting starts at funding + delay (Jan 2, 2027),
	// the same date the loader reports as the next unlock.
	const result = summarize([contract]);
	expect(result.lockedByYear).toEqual([{ year: 2027, amount: 5 }]);
	expect(result.holdings.locked).toBe(5);
	// Past its first window, the zero-lockup shortcut applies: vesting counts from the funding year.
	const started = summarize([
		{
			...contract,
			details: {
				...contract.details!,
				fundingTime: Date.parse('2026-01-05T00:00:00Z') / 1000
			}
		}
	]);
	expect(started.lockedByYear).toEqual([{ year: 2026, amount: 5 }]);
	const delayed = summarize([
		{ ...contract, details: { ...contract.details!, lockupPeriod: 86400 } }
	]);
	expect(delayed.lockedByYear).toEqual([{ year: 2027, amount: 5 }]);
});

it('deduplicates an address used as both owner and contract for stake and blocks', () => {
	const account = online('C0');
	const result = summarize([account], epoch, account);
	expect(result.onlineAccounts).toBe(1);
	expect(result.stakedOnline).toBe(10000);
	expect(result.current.blocks).toBe(1060);
	expect(result.current.expected).toBe(1000);
});
it('excludes a contract-route owner from liquid holdings', () => {
	const account = {
		...online('C0'),
		details: { lockedBalance: 6000e6, availableForWithdrawal: 0, nextVestingDate: null }
	} as WalletAccount;
	const result = summarizeWallet({
		owner: account,
		contracts: [account],
		current: epoch,
		history: [],
		state: 'ready',
		now: 0,
		tokens: { state: 'ready', lp: 0, other: 0, lpCount: 0, tokenCount: 0 }
	});
	expect(result.holdings.liquid).toBe(0);
	expect(result.holdings.locked).toBe(6000);
	expect(result.holdings.other).toBe(4000);
	expect(result.holdings.total).toBe(10000);
});
