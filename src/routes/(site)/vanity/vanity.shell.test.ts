import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { parse } from 'svelte/compiler';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const markup = source.split('</script>')[1];
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';

function loadFunctions(names: string[], state: Record<string, unknown>) {
	const context = createContext(state);
	const functions = names.map((name) => {
		const body = fn(name);
		expect(body, `${name} must be extracted`).not.toBe('');
		// vm runs a script, so substitute only the module URL; the worker remains a throwing spy.
		return body.replace('import.meta.url', "'https://example.test/vanity'");
	});
	runInContext(
		ts.transpileModule(functions.join('\n'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return context;
}

test.each([
	['', '', 'Please specify at least a prefix or suffix for the address'],
	['V!', '', 'Prefix must contain only letters and numbers'],
	['', '7!', 'Suffix must contain only letters and numbers'],
	['VO1', '', 'Prefix must contain only valid Voi address characters (A-Z, 2-7)'],
	['', '780', 'Suffix must contain only valid Voi address characters (A-Z, 2-7)'],
	['V'.repeat(11), '', 'Prefix is too long (max 10 characters)'],
	['', '7'.repeat(11), 'Suffix is too long (max 10 characters)'],
	[
		'',
		'7777',
		'Warning: Finding an address with a 4+ character suffix may take an extremely long time due to checksum constraints. Consider using a shorter suffix or only a prefix.'
	]
])('validateInputs rejects prefix %s and suffix %s', (prefix, suffix, error) => {
	const context = loadFunctions(['validateInputs'], { prefix, suffix, error: null });
	expect(runInContext('validateInputs()', context)).toBe(false);
	expect(context.error).toBe(error);
});

test.each([
	['VOI', ''],
	['', '777']
])('validateInputs accepts prefix %s and suffix %s and clears errors', (prefix, suffix) => {
	const context = loadFunctions(['validateInputs'], { prefix, suffix, error: 'previous error' });
	expect(runInContext('validateInputs()', context)).toBe(true);
	expect(context.error).toBeNull();
});

test('stopSearch terminates the worker, clears the interval and reports attempts', () => {
	const terminate = vi.fn();
	const clearInterval = vi.fn();
	const context = loadFunctions(['stopSearch'], {
		worker: { terminate },
		updateInterval: 42,
		clearInterval,
		isGenerating: true,
		attempts: 1234,
		result: null,
		error: null,
		estimatedTimeRemaining: '1 minute',
		attemptsPerSecond: 50
	});
	runInContext('stopSearch()', context);
	expect(terminate).toHaveBeenCalledOnce();
	expect(clearInterval).toHaveBeenCalledExactlyOnceWith(42);
	expect(context.worker).toBeNull();
	expect(context.updateInterval).toBeNull();
	expect(context.isGenerating).toBe(false);
	expect(context.error).toBe(`Search stopped after ${(1234).toLocaleString()} attempts.`);
	expect(context.estimatedTimeRemaining).toBe('');
	expect(context.attemptsPerSecond).toBe(0);
});

test.each([
	[false, 'VOI'],
	[true, 'INVALID!']
])(
	'generateVanityAddress guards worker construction: ready=%s prefix=%s',
	async (ready, prefix) => {
		const Worker = vi.fn(() => {
			throw new Error('Worker construction must not be reached');
		});
		const context = loadFunctions(['validateInputs', 'generateVanityAddress'], {
			ready,
			prefix,
			suffix: '',
			error: null,
			Worker,
			URL,
			isGenerating: false,
			updateInterval: null,
			worker: null,
			setInterval: vi.fn(),
			updateStats: vi.fn(),
			console: { error: vi.fn() }
		});
		await runInContext('generateVanityAddress()', context);
		expect(Worker).not.toHaveBeenCalled();
		expect(context.setInterval).not.toHaveBeenCalled();
		expect(context.isGenerating).toBe(false);
	}
);

// Traverse the real template AST, including attribute expressions and conditional branches.
type Node = { type: string; start: number; end: number; [key: string]: unknown };
function walk(
	value: unknown,
	visit: (node: Node, ancestors: Node[]) => void,
	ancestors: Node[] = []
) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const child of value) walk(child, visit, ancestors);
		return;
	}
	const node = value as Node;
	const isNode = typeof node.type === 'string';
	if (isNode) visit(node, ancestors);
	for (const child of Object.values(node)) {
		walk(child, visit, isNode ? [...ancestors, node] : ancestors);
	}
}
const template = parse(source).html;
const textOf = (node: Node) => source.slice(node.start, node.end);
const attributes = (node: Node) => (node.attributes ?? []) as Node[];
function liveRegion(node: Node) {
	return (
		node.name === 'InlineAlert' ||
		attributes(node).some(
			(attr) =>
				attr.name === 'aria-live' ||
				(attr.name === 'role' && /\b(status|alert|log)\b/.test(textOf(attr)))
		)
	);
}

test('Aurora shell keeps navigation, labels, browser computation and the blocked notice', () => {
	expect(markup).toContain('href="/how_to_node"');
	expect(markup.match(/<h1\b/g)).toHaveLength(1);
	expect(markup).toContain('Vanity address generator');
	for (const id of ['prefix', 'suffix']) {
		expect(markup).toMatch(new RegExp(`<label\\s+for="${id}"`));
		expect(markup).toContain(`id="${id}"`);
	}
	for (const title of [
		'Choose your pattern',
		'Secure your vanity address',
		'About vanity addresses'
	]) {
		expect(markup).toContain(`<Card title="${title}"`);
	}
	expect(markup.replace(/\s+/g, ' ')).toContain('Computation happens in your browser');
	expect(markup.replace(/\s+/g, ' ')).toContain(
		'Key generation is switched off because another script is loaded in this page. Open voirewards.com/vanity directly in a new tab.'
	);
});

test('Aurora shell removes legacy colors and icons outside the library picker', () => {
	const withoutPicker = source.replace(/<Web3Wallet\b[^]*?\/>/g, '');
	expect(withoutPicker).not.toMatch(
		/bg-purple-|text-purple-|bg-gray-|dark:bg-|bg-green-|bg-yellow-|bg-red-|fas fa-|offline/i
	);
});

const originalPicker = `<Web3Wallet
								enabledWallets={['walletconnect', 'kibisis', 'lute', 'biatec', 'voiwallet']}
								class="bg-gray-100 dark:bg-slate-600 dark:text-gray-200"
								allowWatchAccounts={false}
								showSignInStatus={false}
								displayMode="dropdown"
								{algodClient}
								indexerClient={algodIndexer}
								wcConfig={{
									projectId: wcProjectId,
									name: 'Voi Rewards Auditor',
									description: 'Voi Rewards Auditor',
									url: 'https://voirewards.com',
									icons: ['https://voirewards.com/android-chrome-192x192.png']
								}}
							/>`;
test('exactly one library picker retains its original props byte for byte', () => {
	expect(source.match(/<Web3Wallet\b/g)).toHaveLength(1);
	expect(source.match(/<Web3Wallet\b[^]*?\/>/)?.[0]).toBe(originalPicker);
});

test('Generate submits the guarded handler and remains disabled for an empty pattern', () => {
	expect(markup).toContain('on:submit|preventDefault={generateVanityAddress}');
	expect(markup).toMatch(/<Button\b[^>]*type="submit"[^>]*disabled=\{!prefix && !suffix\}/);
});

test('Stop button calls stopSearch', () => {
	expect(markup).toMatch(/<Button\b[^>]*onclick=\{stopSearch\}[^>]*>\s*Stop Search\s*<\/Button>/);
});

test('Fund & Rekey opens review and only Confirm can start activation', () => {
	expect(markup.match(/\breviewActivation\s*\(/g)).toHaveLength(1);
	expect(markup.match(/\bconfirmActivation\b/g)).toHaveLength(1);
	expect(markup).toMatch(
		/<Button\s+onclick=\{\(\) => reviewActivation\(\)\}[^]*?Fund &amp; Rekey Address[^]*?<\/Button>/
	);
	expect(markup).toContain(
		"disabled={!($selectedWallet?.address && $selectedWallet?.app !== 'Watch') ||"
	);
	expect(markup).toMatch(
		/disabled=\{!\(\$selectedWallet\?\.address[^]*?isActivating \|\|\s*isRekeying \|\|\s*txnStatus === 'sending' \|\|\s*rekeyTxnStatus === 'sending'\}/
	);
	for (const [caller, callee] of [
		['confirmActivation', 'activateVanityAddress'],
		['activateVanityAddress', 'rekeyVanityAddress']
	]) {
		expect(fn(caller)).toMatch(new RegExp(`await ${callee}\\(`));
		const outsideCaller = source.replace(fn(caller), '').replace(fn(callee), '');
		expect(outsideCaller).not.toMatch(new RegExp(`\\b${callee}\\s*\\(`));
	}
	const outsideSigning = source
		.replace(fn('activateVanityAddress'), '')
		.replace(fn('rekeyVanityAddress'), '');
	expect(outsideSigning).not.toMatch(/\bsignTransactions\s*\(|\bsendRawTransaction\b/);
});

test('Confirm is inside reviewOpen && plan and disabled when reviewDrifted', () => {
	let confirms = 0;
	walk(template, (node, ancestors) => {
		if (
			node.name !== 'Button' ||
			!attributes(node).some((attr) => /confirmActivation/.test(textOf(attr)))
		)
			return;
		confirms++;
		expect(
			ancestors.some(
				(parent) =>
					parent.type === 'IfBlock' && textOf(parent.expression as Node) === 'reviewOpen && plan'
			)
		).toBe(true);
		expect(attributes(node).some((attr) => textOf(attr) === 'disabled={reviewDrifted}')).toBe(true);
	});
	expect(confirms).toBe(1);
});

test('funding and rekey failures have distinct messages in Step 2', () => {
	const step2 = markup.slice(markup.indexOf('Step 2:'));
	expect(step2).toMatch(
		/\{#if txnStatus === 'error'\}\s*<InlineAlert\s+message=\{`Funding failed\. \$\{txnError\}`\}/
	);
	expect(step2).toMatch(
		/\{#if rekeyTxnStatus === 'error'\}\s*<InlineAlert\s+message=\{`Rekey failed\. The 1 VOI was already sent; this address is not yet rekeyed\. \$\{txnError\}`\}/
	);
});

test('mnemonic is never in a live region or a copy announcement', () => {
	let expressions = 0;
	walk(template, (node, ancestors) => {
		if (node.type !== 'MemberExpression' || !/^result\??\.mnemonic$/.test(textOf(node))) return;
		expressions++;
		expect(
			ancestors.filter(liveRegion),
			'secret must not be in live-region content or attributes'
		).toEqual([]);
		const copy = ancestors.find((parent) => parent.name === 'CopyButton');
		if (copy) {
			expect(
				ancestors.some((parent) => parent.type === 'Attribute' && parent.name === 'what')
			).toBe(false);
			expect(attributes(copy).some((attr) => textOf(attr) === 'what="mnemonic"')).toBe(true);
		}
	});
	expect(expressions, 'must inspect actual mnemonic expressions').toBeGreaterThan(0);
	expect(markup).toMatch(/<CopyButton\s+text=\{result\.mnemonic\}\s+what="mnemonic"\s*\/>/);
});
