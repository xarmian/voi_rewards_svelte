import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { mnemonicAtRisk } from '../../../lib/chain/vanityGuard';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const script = source.split('</script>')[0];
const fn = (name: string) =>
	source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\t}`))?.[0] ?? '';
const generated = { address: 'VANITY', mnemonic: 'test mnemonic' };

function fixture(state: {
	result: typeof generated | null;
	rekeyTxnStatus: string;
	txnStatus?: string;
	confirmed?: boolean;
}) {
	const body = fn('guardLeave');
	expect(body, 'guardLeave must be extracted').not.toBe('');
	const context = createContext({
		result: state.result,
		rekeyTxnStatus: state.rekeyTxnStatus,
		txnStatus: state.txnStatus ?? 'idle',
		LEAVE_WARNING: 'leave warning',
		mnemonicAtRisk: vi.fn(mnemonicAtRisk),
		confirm: vi.fn(() => state.confirmed ?? false)
	});
	runInContext(
		ts.transpileModule(body, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	const navigate = (type: string) => {
		const navigation = { type, cancel: vi.fn() };
		runInContext('guardLeave', context)(navigation);
		return navigation;
	};
	return { context, navigate };
}

test.each(['leave', 'link'])('no generated address: %s navigation is not guarded', (type) => {
	const f = fixture({ result: null, rekeyTxnStatus: 'idle' });
	const navigation = f.navigate(type);
	expect(navigation.cancel).not.toHaveBeenCalled();
	expect(f.context.confirm).not.toHaveBeenCalled();
});

test('unconfirmed rekey: leaving the site cancels for the native prompt without confirm', () => {
	const f = fixture({ result: generated, rekeyTxnStatus: 'idle' });
	const navigation = f.navigate('leave');
	expect(navigation.cancel).toHaveBeenCalledOnce();
	expect(f.context.confirm).not.toHaveBeenCalled();
});

test('unconfirmed rekey: declining the in-app link prompt cancels', () => {
	const f = fixture({ result: generated, rekeyTxnStatus: 'idle', confirmed: false });
	const navigation = f.navigate('link');
	expect(f.context.confirm).toHaveBeenCalledExactlyOnceWith('leave warning');
	expect(navigation.cancel).toHaveBeenCalledOnce();
});

test('unconfirmed rekey: accepting the in-app link prompt lets it through', () => {
	const f = fixture({ result: generated, rekeyTxnStatus: 'idle', confirmed: true });
	const navigation = f.navigate('link');
	expect(f.context.confirm).toHaveBeenCalledExactlyOnceWith('leave warning');
	expect(navigation.cancel).not.toHaveBeenCalled();
});

test.each(['leave', 'link'])('confirmed rekey: %s navigation is not guarded', (type) => {
	const f = fixture({ result: generated, rekeyTxnStatus: 'success', txnStatus: 'success' });
	const navigation = f.navigate(type);
	expect(navigation.cancel).not.toHaveBeenCalled();
	expect(f.context.confirm).not.toHaveBeenCalled();
});

test('funded but failed rekey: declining a back navigation cancels', () => {
	const f = fixture({
		result: generated,
		rekeyTxnStatus: 'error',
		txnStatus: 'success',
		confirmed: false
	});
	const navigation = f.navigate('popstate');
	expect(f.context.confirm).toHaveBeenCalledExactlyOnceWith('leave warning');
	expect(navigation.cancel).toHaveBeenCalledOnce();
});

test('the guard reads the current state at navigation time', () => {
	const f = fixture({ result: null, rekeyTxnStatus: 'idle', confirmed: false });
	expect(f.navigate('link').cancel).not.toHaveBeenCalled();
	f.context.result = generated;
	expect(f.navigate('link').cancel).toHaveBeenCalledOnce();
	f.context.rekeyTxnStatus = 'success';
	expect(f.navigate('link').cancel).not.toHaveBeenCalled();
});

test('the page registers beforeNavigate at component init, not inside onMount', () => {
	expect(script).toMatch(/import \{[^}]*\bbeforeNavigate\b[^}]*\} from '\$app\/navigation';/);
	expect(script).toMatch(/\n\tbeforeNavigate\(guardLeave\);\n/);
	const onMountBody = script.match(/onMount\(\(\) => \{[^]*?\n\t\}\);/)?.[0] ?? '';
	expect(onMountBody).not.toBe('');
	expect(onMountBody).not.toContain('beforeNavigate');
});
