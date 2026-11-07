import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

it('places the Ecosystem breadcrumb and Markets navigation before the market header', () => {
	const breadcrumb = source.match(/<nav\b[^>]*aria-label="Breadcrumb"[^>]*>[\s\S]*?<\/nav>/)?.[0];
	expect(breadcrumb).toBeDefined();
	expect(breadcrumb).toMatch(/href="\/directory"[^>]*>\s*Ecosystem\s*<\/a>/);
	expect(breadcrumb).toMatch(/aria-current="page"[^>]*>\s*Markets\s*</);
	expect(breadcrumb).toContain('aria-hidden="true"');
	const tabs = source.match(/<Tabs\b[\s\S]*?\/>/)?.[0];
	expect(tabs).toBeDefined();
	for (const attribute of ['variant="nav"', 'label="Explore the ecosystem"', 'current="markets"']) {
		expect(tabs).toContain(attribute);
	}
	expect(tabs).toContain("{ id: 'projects', label: 'Projects', href: '/directory' }");
	expect(tabs).toContain("{ id: 'markets', label: 'Markets Beta', href: '/markets' }");
	expect(source.indexOf('aria-label="Breadcrumb"')).toBeLessThan(source.indexOf('<Tabs'));
	expect(source.indexOf('<Tabs')).toBeLessThan(source.indexOf('<MarketHeader'));
});

it('passes the existing quote timestamp and keeps the Beta alert and market components', () => {
	expect(source).toMatch(/<MarketHeader\b[^>]*quoteAsOf=\{voiUsdAsOf\}/);
	expect(source).toContain('Beta Feature: Markets data is currently in beta');
	for (const component of ['MarketHeader', 'KeyMetrics', 'ChartPanel', 'MarketsPanel']) {
		expect(source).toContain(`import ${component} from './${component}.svelte'`);
		expect(source).toContain(`<${component}`);
	}
});

it('handles the forwarded chart refresh with the visible selection helper', () => {
	const panel = readFileSync(new URL('./ChartPanel.svelte', import.meta.url), 'utf8');
	const chart = readFileSync(
		new URL('../../../lib/components/OHLCVChart.svelte', import.meta.url),
		'utf8'
	);
	expect(chart).toContain(
		"dispatch('refreshData', { tokenPair, resolution: settings.resolution })"
	);
	expect(panel).toMatch(/on:refreshData\s/);
	expect(source).toContain('on:refreshData={handleChartRefresh}');
	expect(source).toMatch(/function handleChartRefresh[\s\S]*?refreshChart\(/);
	expect(source).toContain('tokenChartData = next.data');
	expect(source).toContain('selectionForToken(pairChart, currentTokenId())');
});

it('restores retained fallback history on Back and clears the selected chart through the helper', () => {
	expect(source).toMatch(
		/function handleChartBack\(\)[\s\S]*?priceHistory = tokenPriceHistory;[\s\S]*?pairChart = resetChartSelection/
	);
	expect(source).toMatch(
		/function handleMarketRowClick[\s\S]*?if \(!pairChart.market\) tokenPriceHistory = priceHistory;[\s\S]*?pickMarket\(/
	);
	expect(source).toContain('onBack={handleChartBack}');
	expect(source).toContain('tokenChartData={chartView.data}');
});

it('lets only the newest token or VOI chart request publish, and passes the pair quote to the panel', () => {
	const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
	for (const name of ['fetchTokenChartData', 'fetchVOIChartData']) {
		const body = source.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n\\t\\}\\n`))?.[0];
		expect(body, name).toContain('tokenGate.begin()');
		const guard = body!.indexOf('!tokenGate.isCurrent(request)');
		expect(guard, name).toBeGreaterThan(-1);
		expect(guard, name).toBeLessThan(body!.indexOf('receiveTokenChartResult('));
		expect(body, name).toMatch(
			/finally \{\s*if \(tokenGate\.isCurrent\(request\)\) tokenChartLoading = false;/
		);
	}
	// Only a real conversion (a new array) may label the pair's candles as USD.
	expect(source).toMatch(/converted = convertedCandles !== candles;/);
	expect(source).not.toContain('converted = true;');
	expect(source).toContain('applyPairResult(pairChart, candles, converted)');
	expect(source).toContain('selectedQuote={chartView.selectedQuote}');
});

it('makes the quote control act on a selected pair instead of the hidden token chart', () => {
	const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
	const panel = readFileSync(new URL('./ChartPanel.svelte', import.meta.url), 'utf8');
	expect(page).toMatch(/\n\t+\{fetchPairChartData\}\n/);
	expect(page).toMatch(/async function fetchPairChartData\([\s\S]*?quote/);
	expect(page).toContain('convertsPairToUsd(market.pair, quote)');
	const handler = panel.match(/on:quoteChange=\{[\s\S]*?\n\t{5}\}\}/)?.[0] ?? '';
	expect(handler).toMatch(/if \(selectedMarket\)[\s\S]*?fetchPairChartData\?\.\(\s*selectedMarket/);
});
