import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rowKeys } from './rowKeys';

const unique = (keys: string[]) => new Set(keys).size === keys.length;

// The report rows come from an external JSON file. Svelte >=5.50 throws each_key_duplicate in
// production on a repeated {#each} key, so duplicate rows must still produce unique keys.
describe('rowKeys', () => {
	const payments = [
		{ recipient: 'ALICE', date: '2026-10-01', amount: '10' },
		{ recipient: 'ALICE', date: '2026-10-01', amount: '25' },
		{ recipient: 'BOB', date: '2026-10-01', amount: '5' },
		{ recipient: 'ALICE', date: '2026-10-01', amount: '7' }
	];
	const grants = [
		{ proposal_name: 'Wallet SDK' },
		{ proposal_name: 'Wallet SDK' },
		{ proposal_name: 'Explorer' }
	];

	it('the old key expressions collide on these rows (the rows are a real duplicate case)', () => {
		expect(unique(payments.map((p) => p.recipient + p.date))).toBe(false);
		expect(unique(grants.map((g) => g.proposal_name))).toBe(false);
	});

	it('gives every duplicate payment row a unique key', () => {
		const keys = rowKeys(payments, (p) => `${p.recipient}|${p.date}`);
		expect(keys).toEqual([
			'ALICE|2026-10-01',
			'ALICE|2026-10-01#2',
			'BOB|2026-10-01',
			'ALICE|2026-10-01#3'
		]);
		expect(unique(keys)).toBe(true);
	});

	it('gives every duplicate grant row a unique key', () => {
		const keys = rowKeys(grants, (g) => g.proposal_name);
		expect(keys).toEqual(['Wallet SDK', 'Wallet SDK#2', 'Explorer']);
	});

	it('keeps keys unique when a natural key already looks like a suffixed one', () => {
		const keys = rowKeys(['a', 'a#2', 'a', 'a'], (s) => s);
		expect(unique(keys)).toBe(true);
		expect(keys).toEqual(['a', 'a#2', 'a#3', 'a#4']);
	});

	it('leaves duplicate-free keys unchanged and handles missing lists', () => {
		expect(rowKeys([{ k: 'x' }, { k: 'y' }], (r) => r.k)).toEqual(['x', 'y']);
		expect(rowKeys(undefined, (r: { k: string }) => r.k)).toEqual([]);
		expect(rowKeys(null, (r: { k: string }) => r.k)).toEqual([]);
	});
});

// Wiring: both data-keyed report lists must key through rowKeys, by index.
describe('report lists key through rowKeys', () => {
	const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
	it.each([
		['TransparencyReport.svelte', 'data.community_ecosystem_payments', 'paymentKeys'],
		['GrantsReport.svelte', 'data.grants_submitted_in_progress', 'grantKeys']
	])('%s', (file, list, keys) => {
		const src = read(file);
		expect(src).toContain(`{#each ${list} as `);
		expect(src).toMatch(new RegExp(`\\{#each ${list.replace('.', '\\.')} as \\w+, i \\(${keys}\\[i\\]\\)\\}`));
		expect(src).toMatch(new RegExp(`const ${keys} = \\$derived\\(\\s*rowKeys\\(${list.replace('.', '\\.')},`));
	});
});
