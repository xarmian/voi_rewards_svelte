import { expect, it } from 'vitest';
import { validateMimirParams } from './validate';
const A = 'A'.repeat(58);
const base = `action=get_arc200_transfers&p_user=${A}&p_limit=100&p_offset=0`;
const validate = (query: string) => validateMimirParams(new URLSearchParams(query));
it('accepts user-only transfers only within positive bounded safe round windows', () => {
	expect(validate(base + '&p_min_round=1&p_max_round=1000001')).toEqual({
		action: 'get_arc200_transfers',
		params: { p_user: A, p_limit: 100, p_offset: 0, p_min_round: 1, p_max_round: 1000001 }
	});
	for (const bounds of [
		'',
		'&p_max_round=100',
		'&p_min_round=1',
		'&p_min_round=0&p_max_round=1',
		'&p_min_round=2&p_max_round=1',
		'&p_min_round=1&p_max_round=1000002',
		'&p_min_round=1&p_max_round=9007199254740992'
	])
		expect(validate(base + bounds)).toHaveProperty('error');
});
it('preserves the exact existing contract and user schema, including zero contract and offset ceiling', () => {
	expect(validate(base + '&p_contractid=0')).toEqual({
		action: 'get_arc200_transfers',
		params: { p_contractid: 0, p_user: A, p_limit: 100, p_offset: 0 }
	});
	expect(
		validate(base.replace('p_offset=0', 'p_offset=100000') + '&p_contractid=7')
	).not.toHaveProperty('error');
	for (const key of ['p_min_round', 'p_max_round'])
		expect(validate(base + `&p_contractid=7&${key}=1`)).toEqual({
			error: `Unknown parameter: ${key}`
		});
});
it.each([
	'p_limit=0',
	'p_limit=101',
	'p_offset=100001',
	'p_offset=9007199254740992',
	'p_contractid=-1'
])('rejects invalid legacy parameters %s', (param) => {
	const params = new URLSearchParams(base + '&p_contractid=1');
	const [key, value] = param.split('=');
	params.set(key, value);
	expect(validateMimirParams(params)).toHaveProperty('error');
});
it('retains duplicate, unknown and unrelated required-parameter checks', () => {
	for (const query of [
		base + '&p_contractid=1&p_user=' + A,
		base + '&p_contractid=1&other=1',
		'action=get_tx_counts&p_period=day',
		'action=get_account_transactions_multi'
	])
		expect(validate(query)).toHaveProperty('error');
});
it('accepts exactly one positive token ID and fixed pagination', () => {
	const query = 'action=get_arc200_tokens&contractId=7&limit=1&next-token=0';
	expect(validate(query)).toEqual({
		action: 'get_arc200_tokens',
		params: { contractId: '7', limit: 1, 'next-token': 0 }
	});
	for (const invalid of [
		query.replace('=7', '=0'),
		query.replace('=7', '=1,2'),
		query.replace('=7', '=9007199254740992'),
		query.replace('limit=1', 'limit=2'),
		query.replace('next-token=0', 'next-token=1'),
		query + '&verified=true',
		query + '&contractId=8',
		query.replace('&limit=1', '')
	])
		expect(validate(invalid)).toHaveProperty('error');
});

it('refuses a nonzero offset for user-only transfers', () => {
	expect(
		validate(base.replace('p_offset=0', 'p_offset=1') + '&p_min_round=1&p_max_round=100')
	).toEqual({ error: 'Invalid parameter: p_offset' });
});
it('accepts offset zero for user-only transfers', () => {
	expect(validate(base + '&p_min_round=1&p_max_round=100')).toEqual({
		action: 'get_arc200_transfers',
		params: { p_user: A, p_limit: 100, p_offset: 0, p_min_round: 1, p_max_round: 100 }
	});
});
const MAX = String(Number.MAX_SAFE_INTEGER);
const blockRewards = `action=get_block_rewards&p_address=${A}&p_before_round=${MAX}&p_limit=1000`;
const blockRewardsDaily = `action=get_block_rewards_daily&p_address=${A}&p_days=90`;
const networkDaily = 'action=get_block_rewards_network_daily&p_days=31';
it('accepts block reward pages, including the first-page safe-integer cursor', () => {
	expect(validate(blockRewards)).toEqual({
		action: 'get_block_rewards',
		params: { p_address: A, p_before_round: Number.MAX_SAFE_INTEGER, p_limit: 1000 }
	});
	expect(validate(blockRewards.replace(`=${MAX}`, '=1').replace('=1000', '=1'))).toEqual({
		action: 'get_block_rewards',
		params: { p_address: A, p_before_round: 1, p_limit: 1 }
	});
});
it('accepts account and network daily block reward totals', () => {
	expect(validate(blockRewardsDaily)).toEqual({
		action: 'get_block_rewards_daily',
		params: { p_address: A, p_days: 90 }
	});
	expect(validate(networkDaily)).toEqual({
		action: 'get_block_rewards_network_daily',
		params: { p_days: 31 }
	});
	expect(validate(networkDaily.replace('=31', '=1'))).toEqual({
		action: 'get_block_rewards_network_daily',
		params: { p_days: 1 }
	});
});
it.each([
	blockRewards.replace('p_limit=1000', 'p_limit=1001'),
	blockRewards.replace('p_limit=1000', 'p_limit=0'),
	blockRewards.replace(`p_before_round=${MAX}`, 'p_before_round=0'),
	blockRewards.replace(`p_before_round=${MAX}`, 'p_before_round=9007199254740992'),
	blockRewards.replace(A, 'a'.repeat(58)),
	blockRewards.replace(`&p_address=${A}`, ''),
	blockRewards.replace(`&p_before_round=${MAX}`, ''),
	blockRewards.replace('&p_limit=1000', ''),
	blockRewards + '&p_days=1',
	blockRewardsDaily.replace('p_days=90', 'p_days=91'),
	blockRewardsDaily.replace('p_days=90', 'p_days=0'),
	blockRewardsDaily.replace(A, 'A'.repeat(57)),
	blockRewardsDaily.replace(`&p_address=${A}`, ''),
	blockRewardsDaily.replace('&p_days=90', ''),
	blockRewardsDaily + '&p_limit=1',
	networkDaily.replace('p_days=31', 'p_days=32'),
	networkDaily.replace('p_days=31', 'p_days=0'),
	networkDaily.replace('&p_days=31', ''),
	networkDaily + `&p_address=${A}`
])('rejects invalid block reward query %s', (query) => {
	expect(validate(query)).toHaveProperty('error');
});
it('still accepts offset 100 for contract and user transfers', () => {
	expect(validate(base.replace('p_offset=0', 'p_offset=100') + '&p_contractid=7')).toEqual({
		action: 'get_arc200_transfers',
		params: { p_contractid: 7, p_user: A, p_limit: 100, p_offset: 100 }
	});
});
