import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

// Follow component/consensusData.test.ts: exercise onMount assignments without a browser.
function mount(fetcher: typeof fetch) {
	const source = readFileSync(new URL('./EpochStats.svelte', import.meta.url), 'utf8');
	const script = source
		.split('<script lang="ts">')[1]
		.split('</script>')[0]
		.replace(/^\s*import .*;$/gm, '');
	let onMount: () => void = () => {};
	const context = createContext({
		fetch: fetcher,
		AbortSignal,
		console: { error() {} },
		onMount: (callback: () => void) => {
			onMount = callback;
		},
		theme: { current: 'light' },
		onThemeChange() {},
		createChartLifecycle: () => ({ add() {}, disposed: false }),
		window: { addEventListener() {} }
	});
	runInContext(
		ts.transpileModule(script, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	onMount();
	return (code: string) => runInContext(code, context);
}

async function flush() {
	for (let i = 0; i < 40; i++) await Promise.resolve();
}

afterEach(() => vi.restoreAllMocks());

it('connects every hover explanation to a named keyboard trigger', () => {
	const source = readFileSync(new URL('./EpochStats.svelte', import.meta.url), 'utf8');
	const tooltips = [...source.matchAll(/<div\s+([^>]*group-hover:visible[^>]*)>/g)];
	expect(tooltips).toHaveLength(6);
	const ids = new Set<string>();
	for (const [, attributes] of tooltips) {
		expect(attributes).toContain('group-focus-within:visible');
		expect(attributes).toContain('role="tooltip"');
		const id = attributes.match(/id="([^"]+)"/)?.[1];
		expect(id).toBeTruthy();
		ids.add(id!);
		const button = [...source.matchAll(/<button\s+([^>]+)>/g)].find(([, attrs]) =>
			attrs.includes(`aria-describedby="${id}"`)
		);
		expect(button?.[1]).toMatch(/aria-label="About [^"]+"/);
		expect(button?.[1]).toContain('on:keydown=');
	}
	expect(ids.size).toBe(6);
});

it.each(['/api/markets?token=VOI', '/api/price-history?period=7d', '/api/mimir'])(
	'isolates %s rejection while assigning epochs and finishing loading',
	async (failed) => {
		const fetcher = vi.fn<typeof fetch>(async (url) => {
			if (url === failed) throw new Error('unavailable');
			return Response.json(
				url === '/api/epochs'
					? { epochs: [{ epoch_number: 7 }], current_epoch: 7 }
					: url === '/api/mimir'
						? { data: 42 }
						: []
			);
		});
		const run = mount(fetcher);
		await flush();
		expect(run('epochs[0]?.epoch_number')).toBe(7);
		expect(run('currentEpoch')).toBe(7);
		expect(run('error')).toBeNull();
		expect(run('loading')).toBe(false);
		if (failed.includes('markets')) expect(run('currentPrice')).toBeNull();
		if (failed.includes('price-history')) expect(run('priceHistory.length')).toBe(0);
		if (failed.includes('mimir')) expect(run('onlineAccountCount')).toBeNull();
	}
);

it('epochs settling clears loading without waiting on the other panels', async () => {
	const run = mount(
		vi.fn<typeof fetch>((url) =>
			url === '/api/epochs'
				? Promise.resolve(Response.json({ epochs: [{ epoch_number: 7 }], current_epoch: 7 }))
				: new Promise(() => {})
		)
	);
	await flush();
	expect(run('epochs[0]?.epoch_number')).toBe(7);
	expect(run('loading')).toBe(false);
	expect(run('error')).toBeNull();
});

it.each(['reject', 'http error', 'payload error', 'non-json'])(
	'only an epochs %s sets the component error',
	async (failure) => {
		const run = mount(
			vi.fn<typeof fetch>(async (url) => {
				if (url !== '/api/epochs')
					return Response.json({
						data: 42,
						aggregates: { weightedAveragePrice: 0.01 },
						marketData: []
					});
				if (failure === 'reject') throw new Error('epochs unavailable');
				if (failure === 'non-json') return new Response('broken');
				return Response.json(
					{ error: 'epochs unavailable' },
					{ status: failure === 'http error' ? 500 : 200 }
				);
			})
		);
		await flush();
		expect(run('error')).toBeTruthy();
		expect(run('loading')).toBe(false);
		expect(run('epochs.length')).toBe(0);
		expect(run('currentPrice')).toBe(0.01);
		expect(run('onlineAccountCount')).toBe(42);
	}
);

it('gives the four onMount fetches their own 10000ms abort signal', async () => {
	const timeout = vi.spyOn(AbortSignal, 'timeout');
	const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
	mount(fetcher);
	await flush();
	expect(timeout.mock.calls).toEqual([[10000], [10000], [10000], [10000]]);
	const calls = fetcher.mock.calls.slice(0, 4);
	for (const [, init] of calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
	expect(new Set(calls.map(([, init]) => init?.signal)).size).toBe(4);
});
