import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { ComponentProps } from 'svelte';
import MarketHeader from './MarketHeader.svelte';

type Props = ComponentProps<typeof MarketHeader>;
const props: Props = {
	selectedToken: null,
	tokenInfo: null,
	data: { pageMetaTags: {} } as Props['data'],
	realMarketData: Array(3).fill({}),
	fetchingMarketData: false,
	displayPrice: 0.00123,
	commandPaletteShortcut: 'Ctrl K',
	allTokens: [],
	handleTokenSelect: vi.fn(),
	refreshData: vi.fn(),
	isRefreshing: false,
	onSearch: vi.fn()
};
const html = (overrides: Partial<Props> = {}) =>
	render(MarketHeader, { props: { ...props, ...overrides } }).body.replace(/<!--[\s\S]*?-->/g, '');

it('identifies the token with one markets heading and keeps the formatted price and loaded count', () => {
	const body = html();
	expect(body.match(/<h1\b/g)).toHaveLength(1);
	expect(body).toMatch(/<h1\b[^>]*>\s*VOI markets\s*<\/h1>/);
	expect(body).toMatch(/<h1\b[^>]*>\s*VOI markets\s*<\/h1>\s*<span\b[^>]*>Beta<\/span>/);
	expect(body).toContain('$0.00123');
	expect(body).toMatch(/Loaded markets[\s\S]*?>3<\/span>/);
	expect(body).toContain('Volume-weighted average price across all exchanges');
	expect(body).not.toContain('Last updated');
});

it('shows the quote timestamp in absolute UTC under the price', () => {
	const body = html({ quoteAsOf: '2026-11-06T16:03:45+02:00' });
	expect(body).toMatch(/\$0\.00123<\/p>\s*<p\b[^>]*>Data as of 2026-11-06 14:03 UTC<\/p>/);
	expect(body).toContain('Volume-weighted average price across all exchanges');
	expect(body).not.toContain('Last updated');
});

it('shows unavailable quote time when no timestamp is passed', () => {
	expect(html()).toContain('Quote time unavailable');
});

it('does not date another token’s price with the VOI/USD quote time', () => {
	const body = html({
		quoteAsOf: '2026-11-06T16:03:45+02:00',
		selectedToken: {
			id: 1,
			symbol: 'UNIT',
			decimals: 6,
			type: 'ARC200',
			poolCount: 2,
			imageUrl: null
		}
	});
	expect(body).toContain('Quote time unavailable');
	expect(body).not.toContain('Data as of');
});

it('names both search mechanisms and the refresh control', () => {
	const body = html();
	expect(body).toMatch(/<button\b[^>]*aria-label="Search tokens"[^>]*aria-haspopup="dialog"/);
	expect(body).toMatch(/<input\b[^>]*aria-label="Search tokens"/);
	expect(body).toMatch(/<button\b[^>]*aria-label="Refresh markets"/);
});

it('uses the selected symbol and preserves the missing-price hyphen', () => {
	const body = html({
		selectedToken: {
			id: 1,
			symbol: 'UNIT',
			decimals: 6,
			type: 'ARC200',
			poolCount: 2,
			imageUrl: null
		},
		displayPrice: 0
	});
	expect(body).toMatch(/<h1\b[^>]*>\s*UNIT markets\s*<\/h1>/);
	expect(body).toMatch(/>\s*-\s*</);
});

it('announces price loading and disables the busy refresh action', () => {
	const body = html({ fetchingMarketData: true, isRefreshing: true });
	expect(body).toContain('aria-busy="true"');
	expect(body).toMatch(/role="status"[^>]*>\s*Updating price data/);
	expect(body).toMatch(/<button\b(?=[^>]*aria-label="Refresh markets")(?=[^>]*disabled)[^>]*>/);
	expect(body).not.toContain('Last updated');
});
