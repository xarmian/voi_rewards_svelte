import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import TransferRow from './TransferRow.svelte';

const amount = '1234567.123456789012345678';
const html = render(TransferRow, {
	props: {
		token: {
			id: '1',
			name: 'Wei',
			symbol: 'WEI',
			balance: 1e24,
			balanceRaw: '1000000000000000000000000',
			decimals: 18,
			verified: true,
			imageUrl: '',
			value: 0,
			type: 'arc200'
		},
		transfer: { from: 'other', to: 'wallet', amount, round: 1, timestamp: 1, transactionid: 'tx' },
		walletId: 'wallet',
		showLPExchangeDetails: false,
		expandedRows: new Set<string>(),
		toggleRow: () => {},
		runningBalance: '1000000.000000000000000000',
		change: `+${amount}`,
		getPoolUrl: () => undefined,
		formatTimestamp: () => 'then'
	}
}).body.replace(/<!--[\s\S]*?-->/g, '');

// Tags whose class list holds every given class, followed by their text up to the next tag.
const tagged = (...classes: string[]) =>
	[...html.matchAll(/<(\w+)\s[^>]*class="([^"]*)"[^>]*>([^<]*)/g)].filter(([, , cls]) =>
		classes.every((c) => cls.split(/\s+/).includes(c))
	);

it('lets the mobile amount and change/balance row wrap at narrow widths', () => {
	const mobile = html.slice(html.indexOf('md:hidden'), html.indexOf('hidden md:flex'));
	expect(mobile).toMatch(/class="flex flex-wrap[^"]*justify-between[^"]*"/);
	expect(mobile).toMatch(
		/class="[^"]*\bml-auto\b[^"]*\btext-right\b[^"]*"|class="[^"]*\btext-right\b[^"]*\bml-auto\b[^"]*"/
	);
});

it('lets every long numeric text break inside its column as a last resort', () => {
	const texts = tagged('[overflow-wrap:anywhere]').map(([, , , text]) => text.trim());
	for (const value of [amount, `+${amount}`, 'Balance: 1000000.000000000000000000']) {
		expect(
			texts.filter((t) => t.startsWith(value)),
			value
		).toHaveLength(2);
	}
});
