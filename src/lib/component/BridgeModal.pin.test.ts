import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
const trackerReaction = () =>
	source.match(/\$:\s*\{\s*void pinTick;\s*syncTracker\([^]*?\n\t\}/)?.[0] ?? '';

test('pins the captured sender before any asynchronous work', () => {
	const submit = fn('handleSubmit');
	const pin = submit.indexOf('flow.pin(sender)');
	expect(pin).toBeGreaterThanOrEqual(0);
	expect(pin).toBeLessThan(submit.indexOf('await '));
	expect(submit.slice(pin, submit.indexOf('await '))).toContain('pinTick++');
});

test('reacts to pin changes and holds the tracker on A after selection switches to B', async () => {
	const reaction = trackerReaction();
	expect(reaction).toContain('syncTracker(show, flow.current($selectedWallet?.address))');
	const { createFlowPin } = await import('../chain/flowAccount');
	const flow = createFlowPin();
	const syncTracker = vi.fn();
	const context = createContext({
		flow,
		syncTracker,
		pinTick: 0,
		show: true,
		$selectedWallet: { address: 'A' }
	});
	const run = () => runInContext(ts.transpileModule(reaction, {}).outputText, context);
	run();
	flow.pin('A');
	context.pinTick++;
	context.$selectedWallet.address = 'B';
	run();
	expect(syncTracker).toHaveBeenLastCalledWith(true, 'A');
	flow.release();
	context.pinTick++;
	run();
	expect(syncTracker).toHaveBeenLastCalledWith(true, 'B');
});

test('keeps balance reads with the flow account and ignores selection changes while pinned', () => {
	const subscription =
		source.match(/selectedWallet\.subscribe\(\(wallet\) => \{([^]*?)\n\t\}\)/)?.[1] ?? '';
	expect(subscription).toContain('if (flow.pinned) return');
	expect(subscription).toContain('flow.current(wallet?.address)');
	expect(fn('fetchVoiBalance')).toContain('flow.current($selectedWallet?.address)');
});

test('releases on idle/reset and external close, retaining the account through pending results', () => {
	const release = source.match(/\$:\s*if \([^]*?flow\.release\(\);[^]*?\n\t\}/g)?.join('\n') ?? '';
	expect(release).toContain("bridgeStatus === 'idle'");
	expect(release).toContain('!show');
	expect(release).toContain('pinTick++');
	expect(fn('resetBridgeState')).toContain("bridgeStatus = 'idle'");
	expect(fn('closeModal')).toContain('show = false');
	expect(release).not.toContain("bridgeStatus === 'completed'");
	expect(release).not.toContain("bridgeStatus === 'pending'");
});

test('shows the pinned sender near the transfer status', () => {
	expect(source).toContain('This transfer is from');
	expect(source.replace(/\s+/g, ' ')).toContain('of the account you started it with.');
	expect(source).toMatch(/flow\.address(?:\?|!)?\.slice\(0, 8\)/);
	expect(source).toMatch(/flow\.address(?:\?|!)?\.slice\(-8\)/);
});
