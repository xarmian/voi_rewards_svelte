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
it('still accepts offset 100 for contract and user transfers', () => {
	expect(validate(base.replace('p_offset=0', 'p_offset=100') + '&p_contractid=7')).toEqual({
		action: 'get_arc200_transfers',
		params: { p_contractid: 7, p_user: A, p_limit: 100, p_offset: 100 }
	});
});
