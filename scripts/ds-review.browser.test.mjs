// Uses an existing Playwright installation; no application dependency is added.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node --test scripts/ds-review.browser.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let browser;
let origin;

before(async () => {
	const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
	process.env.PUBLIC_DS_GALLERY = '1';
	process.env.PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
	process.env.PUBLIC_SUPABASE_ANON_KEY = 'x';
	process.env.PUBLIC_MIMIR_URL = 'https://example.supabase.co';
	process.env.PUBLIC_MIMIR_ANON_KEY = 'x';
	process.env.PUBLIC_WALLETCONNECT_PROJECT_ID = 'x';
	process.env.PRIVATE_SUPABASE_ROLE_KEY = 'x';
	server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
	await server.listen();
	origin = `http://127.0.0.1:${server.httpServer.address().port}`;
	browser = await chromium.launch({
		headless: true,
		...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
	});
});

after(async () => {
	await browser?.close();
	await server?.close();
});

async function gallery(options = {}) {
	const page = await browser.newPage(options);
	await page.route('**/*', (route) =>
		new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
	);
	page.on('pageerror', (error) => console.error(error));
	return page;
}

for (const outcome of ['success', 'failure']) {
	test(`CopyButton ${outcome} resets its visible and live text after 1500ms`, async () => {
		const page = await gallery();
		try {
			await page.goto(`${origin}/ds`, { waitUntil: 'networkidle' });
			await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
			await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));
			await page.evaluate((fail) => {
				Object.defineProperty(navigator, 'clipboard', {
					configurable: true,
					value: {
						writeText: async () => {
							if (fail) throw new Error('denied');
						}
					}
				});
			}, outcome === 'failure');
			const button = page.getByRole('button', { name: 'Copy wallet address', exact: true });
			await button.focus();
			await page.keyboard.press('Enter');
			const message = outcome === 'success' ? 'Copied wallet address' : 'Copy failed';
			await page.waitForFunction(
				(text) =>
					[...document.querySelectorAll('[aria-live]')].some((el) => el.textContent === text),
				message
			);
			await page.clock.runFor(1499);
			assert.match(await button.textContent(), outcome === 'success' ? /✓/ : /Copy failed/);
			await page.clock.runFor(1);
			assert.doesNotMatch(await button.textContent(), /✓|Copy failed/);
			assert.equal(await button.evaluate((el) => el.nextElementSibling.textContent), '');
		} finally {
			await page.close();
		}
	});

	test(`CopyButton repeat ${outcome} re-announces before the reset`, async () => {
		const page = await gallery();
		try {
			await page.goto(`${origin}/ds`, { waitUntil: 'networkidle' });
			await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
			await page.clock.pauseAt(new Date('2026-10-26T12:00:01Z'));
			await page.evaluate((fail) => {
				Object.defineProperty(navigator, 'clipboard', {
					configurable: true,
					value: {
						writeText: async () => {
							if (fail) throw new Error('denied');
						}
					}
				});
				const button = document.querySelector('button[aria-label="Copy wallet address"]');
				window.copyAnnouncements = [];
				new MutationObserver(() =>
					window.copyAnnouncements.push(button.nextElementSibling.textContent)
				).observe(button.nextElementSibling, {
					childList: true,
					subtree: true,
					characterData: true
				});
			}, outcome === 'failure');
			const button = page.getByRole('button', { name: 'Copy wallet address', exact: true });
			await button.focus();
			await page.keyboard.press('Enter');
			const message = outcome === 'success' ? 'Copied wallet address' : 'Copy failed';
			await page.waitForFunction((text) => window.copyAnnouncements.includes(text), message);
			await page.keyboard.press('Space');
			await page.clock.runFor(50);
			const announcements = await page.evaluate(() => window.copyAnnouncements);
			assert.equal(announcements.filter((text) => text === message).length, 2);
			assert.ok(announcements.includes(''), 'live region clears between repeated announcements');
		} finally {
			await page.close();
		}
	});
}

for (const reduced of [true, false]) {
	test(`HealthRing ${reduced ? 'reduced motion preserves the final SSR arc without starting animation' : 'allowed motion keeps fill-on-mount animation'}`, async () => {
		const page = await gallery({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
		try {
			await page.addInitScript(() => {
				window.ringOffsets = [];
				new MutationObserver((records) => {
					for (const record of records) {
						if (record.target.matches('circle[stroke-dashoffset]')) {
							window.ringOffsets.push({
								before: record.oldValue,
								after: record.target.getAttribute('stroke-dashoffset')
							});
						}
					}
				}).observe(document, {
					attributes: true,
					attributeFilter: ['stroke-dashoffset'],
					attributeOldValue: true,
					subtree: true
				});
			});
			await page.goto(`${origin}/ds`, { waitUntil: 'networkidle' });
			// Hydration is complete once the theme button can update state.
			const theme = page.getByRole('button', { name: 'Dark theme', exact: true });
			await theme.click();
			await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
			await page.waitForTimeout(100);
			const changes = await page.evaluate(() =>
				window.ringOffsets.filter((change) => change.before !== change.after)
			);
			const arc = page
				.locator('svg[aria-label="3 of 16 contracts online"]')
				.first()
				.locator('circle[stroke-dashoffset]');
			const expected = 2 * Math.PI * 49 * (1 - 3 / 16);
			assert.ok(Math.abs(Number(await arc.getAttribute('stroke-dashoffset')) - expected) < 1e-10);
			if (reduced) assert.deepEqual(changes, []);
			else assert.ok(changes.length > 0, 'allowed motion starts from the empty arc');
		} finally {
			await page.close();
		}
	});
}
