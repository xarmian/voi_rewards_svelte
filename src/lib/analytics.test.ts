import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { analyticsPageView } from './analytics';

const ADDRESS = 'W2ZRJMYYAJUN5IEFSUEXLYCJJ4RIMVRBK7YKFTQPCW6Q7PH3LRNKCWFJLE';

it.each([
	[`https://voirewards.com/wallet/${ADDRESS}`, '/wallet/:address'],
	[`https://voirewards.com/wallet/${ADDRESS}/`, '/wallet/:address'],
	[`https://voirewards.com/wallet/${ADDRESS}?tab=holdings#top`, '/wallet/:address'],
	[`https://voirewards.com/wallet/nick.voi`, '/wallet/:address'],
	[`https://voirewards.com/wallet?q=${ADDRESS}`, '/wallet']
])('wallet URL %s is reported as %s with no address anywhere', (href, path) => {
	const view = analyticsPageView(new URL(href));
	expect(view.page_path).toBe(path);
	expect(view.page_location).toBe(`https://voirewards.com${path}`);
	expect(view.page_title).toBe('Wallet');
	expect(JSON.stringify(view)).not.toContain(ADDRESS);
});

it('leaves other pages as they are, query string included', () => {
	const view = analyticsPageView(new URL('https://voirewards.com/markets?quote=usd'));
	expect(view).toEqual({
		page_location: 'https://voirewards.com/markets?quote=usd',
		page_path: '/markets?quote=usd'
	});
});

it('does not treat a path that merely starts with wallet as a wallet page', () => {
	const view = analyticsPageView(new URL('https://voirewards.com/walletish'));
	expect(view.page_path).toBe('/walletish');
});

it('the layout loads GA per navigation and sets the redacted location on the tag', () => {
	const source = readFileSync(new URL('../routes/+layout.svelte', import.meta.url), 'utf8');
	expect(source).toContain('if (loadAnalytics(nav.to.url.pathname)) sendPageView(');
	expect(source).toContain("gtag('set', view)");
});

it('the layout turns off the automatic page view and sends the redacted one', () => {
	const source = readFileSync(new URL('../routes/+layout.svelte', import.meta.url), 'utf8');
	expect(source).toContain("gtag('config', 'G-NDX21XVC4G', {send_page_view: false})");
	expect(source).toContain('analyticsPageView(url)');
});
