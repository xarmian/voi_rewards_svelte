import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./SendTokenModal.svelte', import.meta.url), 'utf8');
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
const trackerReaction = () =>
	source.match(/\$:\s*\{\s*void pinTick;\s*syncTracker\([^]*?\n\t\}/)?.[0] ?? '';

test('pins the captured sender before any asynchronous work', () => {
	const submit = fn('handleSend');
	const pin = submit.indexOf('flow.pin(sender)');
	expect(pin).toBeGreaterThanOrEqual(0);
	expect(pin).toBeLessThan(submit.indexOf('await '));
	expect(submit.slice(pin, submit.indexOf('await '))).toContain('pinTick++');
});

test('reacts to pin changes and holds the tracker on A after selection switches to B', async () => {
	const reaction = trackerReaction();
	expect(reaction).toContain('syncTracker(open, flow.current(accountAddress ?? $selectedWallet?.address))');
	const { createFlowPin } = await import('../chain/flowAccount');
	const flow = createFlowPin();
	const syncTracker = vi.fn();
	const context = createContext({
		accountAddress: undefined,
		flow,
		syncTracker,
		pinTick: 0,
		open: true,
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
	expect(source).toContain('!flow.pinned');
	expect(source).toMatch(/requireAccountInfo\(address, \{ force: true \}\)/);
	expect(source).toContain('const address = flow.current(accountAddress ?? $selectedWallet?.address)');
});

test('releases on idle/reset and external close, retaining the account through pending results', () => {
	const release = source.match(/\$:\s*if \([^]*?flow\.release\(\);[^]*?\n\t\}/g)?.join('\n') ?? '';
	expect(release).toContain("txState === 'idle'");
	expect(release).toContain('!open');
	expect(release).toContain('pinTick++');
	expect(fn('resetState')).toContain("txState = 'idle'");
	expect(fn('handleClose')).toContain('open = false');
	expect(release).toContain('!showResults');
});

test('shows the pinned sender near the transfer status', () => {
	expect(source).toContain('This transfer is from');
	expect(source.replace(/\s+/g, ' ')).toContain('of the account you started it with.');
	expect(source).toMatch(/flow\.address(?:\?|!)?\.slice\(0, 8\)/);
	expect(source).toMatch(/flow\.address(?:\?|!)?\.slice\(-8\)/);
});

test('the unpinned tracker follows the page account even when selection changes', () => {
	const syncTracker = vi.fn();
	const context = createContext({
		accountAddress: 'Y', $selectedWallet: { address: 'X' },
		flow: { current: (address: string) => address }, syncTracker, open: true, pinTick: 0
	});
	runInContext(ts.transpileModule(trackerReaction(), {}).outputText, context);
	expect(syncTracker).toHaveBeenCalledWith(true, 'Y');
});
