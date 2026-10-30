import {
	assert,
	assertEquals,
	assertStringIncludes
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { createHandler, type HandlerDeps, type MarketSnapshot } from './handler.ts';

const snapshot: MarketSnapshot = { trading_pair_id: 4, price: 0.001, volume_24h: 12 };
const serviceRoleKey = 'service-role-test-key';
const request = (authorization?: string, method = 'POST') =>
	new Request('https://example.com', {
		method,
		headers: authorization ? { Authorization: authorization } : {}
	});

function setup(overrides: Partial<HandlerDeps> = {}) {
	let calls = 0;
	const inserts: MarketSnapshot[][] = [];
	const logs: string[] = [];
	const deps: HandlerDeps = {
		sources: [
			{
				name: 'Tinyman',
				fetch: () => {
					calls++;
					return Promise.resolve(snapshot);
				}
			}
		],
		insert: (rows) => {
			inserts.push(rows);
			return Promise.resolve();
		},
		requireServiceRole: false,
		serviceRoleKey,
		sourceTimeoutMs: 50,
		logger: { error: (...args: unknown[]) => logs.push(args.map(String).join(' ')) },
		...overrides
	};
	return { handler: createHandler(deps), inserts, logs, calls: () => calls };
}

Deno.test('source deadline inserts completed snapshots when one source never settles', async () => {
	const other = { ...snapshot, trading_pair_id: 5, volume_24h: null };
	const { handler, inserts, logs } = setup({
		sources: [
			{ name: 'Tinyman', fetch: () => Promise.resolve(snapshot) },
			{ name: 'stalled Uniswap', fetch: () => new Promise(() => {}) },
			{ name: 'PactFi', fetch: () => Promise.resolve(other) }
		]
	});
	const started = performance.now();
	// A separate watchdog makes removal of the deadline fail instead of hanging the suite.
	let watchdog: ReturnType<typeof setTimeout> | undefined;
	try {
		const response = await Promise.race([
			handler(request()),
			new Promise<never>((_, reject) => {
				watchdog = setTimeout(
					() => reject(new Error('handler exceeded source deadline + 100 ms')),
					150
				);
			})
		]);
		assert(performance.now() - started < 150);
		assertEquals(response.status, 200);
		assertEquals(await response.json(), { success: true, snapshots_count: 2 });
		assertEquals(inserts, [[snapshot, other]]);
		assertEquals(logs.length, 1);
		assertStringIncludes(logs[0], 'stalled Uniswap');
	} finally {
		clearTimeout(watchdog);
	}
});

Deno.test('all sources null returns 200 without inserting', async () => {
	const { handler, inserts } = setup({
		sources: [{ name: 'empty', fetch: () => Promise.resolve(null) }]
	});
	const response = await handler(request());
	assertEquals(response.status, 200);
	assertEquals(await response.json(), { success: true, snapshots_count: 0 });
	assertEquals(inserts, []);
});

Deno.test('insert error returns 500 with the existing error response', async () => {
	const { handler } = setup({ insert: () => Promise.reject(new Error('insert failed')) });
	const response = await handler(request());
	assertEquals(response.status, 500);
	assertEquals(await response.json(), { success: false, error: 'insert failed' });
});

Deno.test('source rejection is logged and the other sources still insert', async () => {
	const { handler, inserts, logs } = setup({
		sources: [
			{ name: 'Tinyman', fetch: () => Promise.resolve(snapshot) },
			{ name: 'broken', fetch: () => Promise.reject(new Error('failure')) }
		]
	});
	const response = await handler(request());
	assertEquals(response.status, 200);
	assertEquals(await response.json(), { success: true, snapshots_count: 1 });
	assertEquals(inserts, [[snapshot]]);
	assertEquals(logs.length, 1);
	assertStringIncludes(logs[0], 'broken');
	assertStringIncludes(logs[0], 'failure');
});

Deno.test('auth off accepts an anon bearer and runs sources', async () => {
	const { handler, calls } = setup();
	assertEquals((await handler(request('Bearer anon'))).status, 200);
	assertEquals(calls(), 1);
});

for (const [name, authorization] of [
	['missing header', undefined],
	['anon bearer', 'Bearer anon'],
	['same-length wrong key', `Bearer ${'x'.repeat(serviceRoleKey.length)}`],
	['wrong scheme', `Basic ${serviceRoleKey}`],
	['extra prefix', `Bearer Bearer ${serviceRoleKey}`]
] as const) {
	Deno.test(`auth on rejects ${name} before fetching`, async () => {
		const { handler, calls, inserts } = setup({ requireServiceRole: true });
		const response = await handler(request(authorization));
		assertEquals(response.status, 401);
		assertEquals(response.headers.get('Content-Type'), 'application/json');
		assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
		assertEquals((await response.json()).success, false);
		assertEquals(calls(), 0);
		assertEquals(inserts, []);
	});
}

Deno.test('auth on accepts the exact service key', async () => {
	const { handler, calls } = setup({ requireServiceRole: true });
	assertEquals((await handler(request(`Bearer ${serviceRoleKey}`))).status, 200);
	assertEquals(calls(), 1);
});

Deno.test('OPTIONS answers preflight with auth on and fetches nothing', async () => {
	const { handler, calls } = setup({ requireServiceRole: true });
	const response = await handler(request(undefined, 'OPTIONS'));
	assertEquals(response.status, 200);
	assertEquals(await response.text(), 'ok');
	assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
	assertEquals(calls(), 0);
});

Deno.test('fast sources clear every deadline timer', async () => {
	const pending = new Set<ReturnType<typeof setTimeout>>();
	let scheduled = 0;
	let cleared = 0;
	const { handler } = setup({
		timers: {
			setTimeout: (callback, delay) => {
				scheduled++;
				const id = setTimeout(callback, delay);
				pending.add(id);
				return id;
			},
			clearTimeout: (id) => {
				cleared++;
				pending.delete(id);
				clearTimeout(id);
			}
		}
	});
	try {
		assertEquals((await handler(request())).status, 200);
		assertEquals(scheduled, 1);
		assertEquals(cleared, 1);
		assertEquals(pending.size, 0);
	} finally {
		for (const id of pending) clearTimeout(id);
	}
});
