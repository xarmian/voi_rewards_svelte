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
