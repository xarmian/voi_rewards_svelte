import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const between = (start: string, end: string) => {
	const from = source.indexOf(start);
	const to = source.indexOf(end, from);
	expect(from, `Missing ${start}`).toBeGreaterThan(-1);
	expect(to, `Missing ${end}`).toBeGreaterThan(from);
	return source.slice(from, to);
};
const content = between('<!-- Scrollable Content -->', '<!-- Fixed Footer -->');
const footer = between('<!-- Fixed Footer -->', '</Modal>\n\n<style>');

// Walks the markup's {#if}/{#each} blocks with the given state and returns the lines that render.
// Markup text is kept raw: the assertions only need to know which branch a line sits in.
function rendered(markup: string, state: Record<string, unknown>): string {
	const code = ['const out = [];'];
	for (const raw of markup.split('\n')) {
		let line = raw.trim();
		let close = 0;
		while (line.endsWith('{/if}') || line.endsWith('{/each}')) {
			close++;
			line = line.slice(0, line.lastIndexOf('{/')).trim();
		}
		const block = line.match(/^\{(#if|:else if|:else|#each) ?(.*?)\}(.*)$/);
		if (block) {
			const [, kind, expression, rest] = block;
			if (kind === '#if') code.push(`if (${expression}) {`);
			else if (kind === ':else if') code.push(`} else if (${expression}) {`);
			else if (kind === ':else') code.push('} else {');
			else {
				const [, list, name] = expression.match(/^(.*) as (\w+)(?: \(.*\))?$/) ?? [];
				code.push(`for (const ${name} of ${list}) {`);
			}
			line = rest.trim();
		}
		if (line && !/^\{\/(if|each)\}$/.test(line)) code.push(`out.push(${JSON.stringify(line)});`);
		if (/^\{\/(if|each)\}$/.test(line)) close++;
		for (let i = 0; i < close; i++) code.push('}');
	}
	// Prettier wraps long text, so lines are joined with a space to read as the page would.
	code.push('out.join(" ");');
	const scope = new Proxy(state, { has: () => true, get: (target, key) => target[key as string] });
	const context = createContext({ scope });
	return runInContext(`with (scope) { ${code.join('\n')} }`, context);
}

const restored = [
	{
		status: 'pending',
		record: {
			kind: 'bridge',
			firstTxId: 'T1',
			txIds: ['T1'],
			recipients: [{ address: 'BRIDGE', amount: '5' }],
			symbol: 'VOI'
		}
	}
];
const idle = (overrides: Record<string, unknown>) =>
	rendered(content, {
		bridgeStatus: 'idle',
		canSignTransactions: true,
		restoredBridgeEntries: [],
		isVoiToAlgorand: true,
		pickedName: () => null,
		algorandDestination: { text: '', address: '', error: '' },
		...overrides
	});
const form = '<!-- Bridge Direction Selection -->';
const notice = 'Bridging from voirewards is turned off.';
const above = 'Transfers you already started are shown above.';
const none = 'No bridge transfers are in progress.';

test('with bridging off the idle view has no form but keeps restored bridges', () => {
	const view = idle({ BRIDGE_ENABLED: false, restoredBridgeEntries: restored });
	expect(view).toContain('Awaiting confirmation');
	expect(view).toContain('{entry.record.symbol} to {recipient.address}');
	expect(view).toContain(notice);
	expect(view).toContain(above);
	expect(view).not.toContain(none);
	for (const part of [form, 'for="destinationAddress"', '<!-- QR Code Modal -->', 'Opt-in to aVOI'])
		expect(view, `${part} belongs to the new-bridge form`).not.toContain(part);
});

test('with bridging off and nothing in flight the idle view says so', () => {
	const view = idle({ BRIDGE_ENABLED: false });
	expect(view).not.toContain('Awaiting confirmation');
	expect(view).toContain(notice);
	expect(view).toContain(none);
	expect(view, 'nothing is listed above').not.toContain(above);
	expect(view).not.toContain(form);
});

test('with bridging on the idle view is the form as before', () => {
	const view = idle({ BRIDGE_ENABLED: true, restoredBridgeEntries: restored });
	expect(view).toContain('Awaiting confirmation');
	expect(view).toContain(form);
	expect(view).toContain('for="destinationAddress"');
	expect(view).not.toContain(notice);
	expect(
		idle({ BRIDGE_ENABLED: true, canSignTransactions: false }),
		'needs the signer'
	).not.toContain(form);
});

test('with bridging off the footer offers only Close, and no Bridge Again', () => {
	const idleFooter = rendered(footer, {
		bridgeStatus: 'idle',
		canSignTransactions: true,
		BRIDGE_ENABLED: false
	});
	expect(idleFooter).toContain("{BRIDGE_ENABLED ? 'Cancel' : 'Close'}");
	expect(idleFooter).not.toContain('on:click={handleSubmit}');
	const done = rendered(footer, { bridgeStatus: 'completed', BRIDGE_ENABLED: false });
	expect(done).not.toContain('Bridge Again');
	expect(done).toContain('Close');
});

test('with bridging on the footer is unchanged', () => {
	const idleFooter = rendered(footer, {
		bridgeStatus: 'idle',
		canSignTransactions: true,
		BRIDGE_ENABLED: true
	});
	expect(idleFooter).toContain('on:click={handleSubmit}');
	expect(idleFooter).toContain("{isVoiToAlgorand ? 'Bridge to Algorand' : 'Generate QR Code'}");
	expect(rendered(footer, { bridgeStatus: 'completed', BRIDGE_ENABLED: true })).toContain(
		'Bridge Again'
	);
});

test('the pending tracker runs whether or not bridging is on', () => {
	const sync = source.match(
		/\$: \{\s*void pinTick;\s*syncTracker\(show, flow\.current\(accountAddress\)\);\s*\}/
	);
	expect(sync, 'The tracker sync must stay unconditional').not.toBeNull();
	expect(source.slice(0, source.indexOf('</script>'))).not.toMatch(
		/BRIDGE_ENABLED[^\n]*syncTracker/
	);
});

test('with bridging off the token picker cannot open', () => {
	const picker = between('<!-- Fixed Header -->', '{#if showTokenSelector}');
	expect(picker).toContain("disabled={!BRIDGE_ENABLED || bridgeStatus !== 'idle'}");
	const click = picker.match(/on:click=\{\(\) =>([\s\S]*?)\}\n/)?.[1];
	expect(click, 'the picker click handler').toBeDefined();
	const run = (BRIDGE_ENABLED: boolean) => {
		const state = { BRIDGE_ENABLED, bridgeStatus: 'idle', showTokenSelector: false };
		runInContext(`with (state) { ${click} }`, createContext({ state }));
		return state.showTokenSelector;
	};
	expect(run(false)).toBe(false);
	expect(run(true)).toBe(true);
});
