import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	main,
	parseSvelteCheck,
	parseEslint,
	compareCounts,
	serializeBaseline
} from './quality-ratchet.mjs';

const empty = () => ({ 'svelte-check': {}, eslint: {} });
const counts = (errors: number, warnings = 0) => ({ errors, warnings });

// An ignored injection must fail safely rather than launch tools against the working tree.
vi.mock('node:child_process', () => ({
	spawnSync: () => {
		throw new Error('Tests must use the injected run');
	}
}));

type RunResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
	signal: string | null;
};

function mainFixture(baseline = empty()) {
	let baselineText = JSON.stringify(baseline);
	const outputs: Record<string, RunResult> = {
		'svelte-check': {
			status: 0,
			stdout: '100 COMPLETED 0 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS',
			stderr: '',
			signal: null
		},
		eslint: { status: 0, stdout: '[]', stderr: '', signal: null }
	};
	const deps = {
		run: vi.fn((command: string, args: string[], env: NodeJS.ProcessEnv) => {
			expect(env).toBeDefined();
			if (command === 'npx' && outputs[args[0]]) return outputs[args[0]];
			return { status: 0, stdout: '', stderr: '', signal: null };
		}),
		readBaseline: vi.fn(() => baselineText),
		writeBaseline: vi.fn((text: string) => {
			baselineText = text;
		}),
		log: vi.fn(),
		error: vi.fn()
	};
	return { deps, outputs };
}

describe('main exit decisions', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('returns 0 without writing for equal counts', () => {
		const { deps } = mainFixture();
		expect(main([], deps)).toBe(0);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.log).toHaveBeenCalledWith('quality-ratchet: equal');
	});

	it('returns 1 without writing and logs RISE for an increase', () => {
		const { deps, outputs } = mainFixture();
		outputs.eslint.status = 1;
		outputs.eslint.stdout = JSON.stringify([
			{ filePath: 'src/a.ts', messages: [{ severity: 2, message: 'error' }] }
		]);
		expect(main([], deps)).toBe(1);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.log).toHaveBeenCalledWith('RISE eslint src/a.ts errors 0 -> 1');
	});

	it('returns 0 and writes the lowered baseline for a drop', () => {
		const { deps } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(1) } });
		expect(main([], deps)).toBe(0);
		expect(deps.writeBaseline).toHaveBeenCalledTimes(1);
		expect(JSON.parse(deps.readBaseline())).toEqual(empty());
	});

	it('returns 1 without writing for a drop with --frozen', () => {
		const { deps } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(1) } });
		expect(main(['--frozen'], deps)).toBe(1);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
	});

	it('returns 0 and writes current counts for a rise with --update', () => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].status = 1;
		outputs['svelte-check'].stdout =
			'100 ERROR "src/a.ts" 1:2 "error"\n101 COMPLETED 1 FILES 1 ERRORS 0 WARNINGS 1 FILES_WITH_PROBLEMS';
		expect(main(['--update'], deps)).toBe(0);
		expect(deps.writeBaseline).toHaveBeenCalledTimes(1);
		expect(JSON.parse(deps.readBaseline())).toEqual({
			...empty(),
			'svelte-check': { 'src/a.ts': counts(1) }
		});
	});

	it('returns 2 without writing or reporting zero when svelte-check lacks COMPLETED', () => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].stdout = '';
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('missing COMPLETED'));
		expect(deps.log).toHaveBeenCalledWith(
			expect.stringContaining('svelte-check unknown errors unknown warnings')
		);
	});

	it.each([2, 3, null])('returns 2 without writing for svelte-check status %s', (status) => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].status = status;
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('svelte-check'));
	});

	it.each(['tool crashed', '{}', '[{}]'])(
		'returns 2 without writing for invalid ESLint JSON results: %s',
		(stdout) => {
			const { deps, outputs } = mainFixture();
			outputs.eslint.stdout = stdout;
			expect(main([], deps)).toBe(2);
			expect(deps.writeBaseline).not.toHaveBeenCalled();
			expect(deps.error).toHaveBeenCalledWith(
				expect.stringContaining('ESLint did not produce valid completed JSON results')
			);
			expect(deps.log).toHaveBeenCalledWith(
				expect.stringContaining('eslint unknown errors unknown warnings')
			);
		}
	);

	it('returns 2 without writing for ESLint status 2 even with valid JSON', () => {
		const { deps, outputs } = mainFixture();
		outputs.eslint.status = 2;
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(
			expect.stringContaining('eslint . --format json failed')
		);
	});

	it('returns 2 without writing when run returns a spawn error', () => {
		const { deps, outputs } = mainFixture();
		outputs['svelte-check'].error = new Error('spawn failed');
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('spawn failed'));
	});

	it('returns 2 without writing for an unknown argument', () => {
		const { deps } = mainFixture();
		expect(main(['--unknown'], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith('quality-ratchet: Unknown argument: --unknown');
		expect(deps.run).not.toHaveBeenCalled();
	});

	it.each([-1, 1.5])('returns 2 without writing for invalid baseline count %s', (count) => {
		const { deps } = mainFixture({ ...empty(), eslint: { 'src/a.ts': counts(count) } });
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith(
			'quality-ratchet: Invalid baseline count: eslint src/a.ts errors'
		);
		expect(deps.run).not.toHaveBeenCalled();
	});

	it('returns 0 and writes a missing baseline with --update', () => {
		const { deps } = mainFixture();
		deps.readBaseline.mockImplementationOnce(() => {
			throw Object.assign(new Error('baseline missing'), { code: 'ENOENT' });
		});
		expect(main(['--update'], deps)).toBe(0);
		expect(deps.writeBaseline).toHaveBeenCalledTimes(1);
		expect(JSON.parse(deps.readBaseline())).toEqual(empty());
	});

	it('returns 2 without writing for a missing baseline without --update', () => {
		const { deps } = mainFixture();
		deps.readBaseline.mockImplementationOnce(() => {
			throw Object.assign(new Error('baseline missing'), { code: 'ENOENT' });
		});
		expect(main([], deps)).toBe(2);
		expect(deps.writeBaseline).not.toHaveBeenCalled();
		expect(deps.error).toHaveBeenCalledWith('quality-ratchet: baseline missing');
		expect(deps.run).not.toHaveBeenCalled();
	});

	it('forces all seven environment variables to x for every command', () => {
		const forcedEnv = {
			PUBLIC_SUPABASE_URL: 'x',
			PUBLIC_SUPABASE_ANON_KEY: 'x',
			PUBLIC_MIMIR_URL: 'x',
			PUBLIC_MIMIR_ANON_KEY: 'x',
			PUBLIC_WALLETCONNECT_PROJECT_ID: 'x',
			PUBLIC_DS_GALLERY: 'x',
			PRIVATE_SUPABASE_ROLE_KEY: 'x'
		};
		for (const name of Object.keys(forcedEnv)) vi.stubEnv(name, 'inherited');
		const { deps } = mainFixture();
		expect(main([], deps)).toBe(0);
		expect(deps.run).toHaveBeenCalledTimes(4);
		for (const [, , env] of deps.run.mock.calls) {
			for (const name of Object.keys(forcedEnv)) expect(env[name]).toBe('x');
		}
		for (const name of Object.keys(forcedEnv)) expect(process.env[name]).toBe('inherited');
	});
});

describe('svelte-check machine output', () => {
	it('counts errors and warnings per file and ignores other lines', () => {
		const result = parseSvelteCheck(
			[
				'100 START "/repo"',
				'101 ERROR "src/a.svelte" 2:3 "first error"',
				'102 ERROR "src/a.svelte" 4:5 "second error"',
				'103 WARNING "src/a.svelte" 6:7 "warning"',
				'104 WARNING "src/b.ts" 8:9 "another warning"',
				'unrelated output',
				'105 COMPLETED 2 FILES 2 ERRORS 2 WARNINGS 2 FILES_WITH_PROBLEMS'
			].join('\n')
		);
		expect(result.completed).toBe(true);
		expect(result.counts).toEqual({ 'src/a.svelte': counts(2, 1), 'src/b.ts': counts(0, 1) });
		expect(result.diagnostics[0]).toEqual({
			file: 'src/a.svelte',
			severity: 'errors',
			line: 2,
			column: 3,
			message: 'first error'
		});
	});

	it('decodes quotes and escaped newlines in messages', () => {
		const message = 'Expected "number"\nbut got "string"';
		const result = parseSvelteCheck(
			`100 ERROR "src/a.ts" 1:2 ${JSON.stringify(message)}\n101 COMPLETED 1 FILES 1 ERRORS 0 WARNINGS 1 FILES_WITH_PROBLEMS`
		);
		expect(result.diagnostics[0].message).toBe(message);
		expect(result.counts).toEqual({ 'src/a.ts': counts(1) });
	});

	it('reports missing COMPLETED as incomplete even when diagnostics exist', () => {
		expect(parseSvelteCheck('100 ERROR "src/a.ts" 1:2 "error"').completed).toBe(false);
		expect(parseSvelteCheck('').completed).toBe(false);
	});
});

describe('ESLint JSON output', () => {
	it('counts severities, relativizes absolute paths and omits clean files', () => {
		const result = parseEslint(
			JSON.stringify([
				{
					filePath: '/repo/src/a.ts',
					messages: [
						{ severity: 2, line: 3, column: 4, message: 'error' },
						{ severity: 1, line: 5, column: 6, message: 'warning' }
					]
				},
				{ filePath: '/repo/src/clean.ts', messages: [] }
			]),
			'/repo'
		);
		expect(result.counts).toEqual({ 'src/a.ts': counts(1, 1) });
		expect(result.diagnostics[1]).toEqual({
			file: 'src/a.ts',
			severity: 'warnings',
			line: 5,
			column: 6,
			message: 'warning'
		});
	});

	it('counts fatal parse messages as errors', () => {
		const result = parseEslint(
			JSON.stringify([
				{
					filePath: '/repo/src/broken.ts',
					messages: [{ severity: 2, fatal: true, message: 'Parsing error' }]
				}
			]),
			'/repo'
		);
		expect(result.counts).toEqual({ 'src/broken.ts': counts(1) });
	});

	it('rejects invalid JSON and invalid result shapes instead of returning zero', () => {
		for (const output of ['', 'tool crashed', '{}', '[{}]']) {
			expect(() => parseEslint(output, '/repo')).toThrow();
		}
	});
});

describe('baseline comparison', () => {
	it('reports one added svelte-check error in a baselined file', () => {
		const result = compareCounts(
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(2) } },
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(3) } }
		);
		expect(result.rises).toEqual([
			{ tool: 'svelte-check', file: 'src/a.ts', severity: 'errors', baseline: 2, current: 3 }
		]);
		expect(result.failed).toBe(true);
	});

	it('treats a file absent from the baseline as zero', () => {
		const result = compareCounts(empty(), {
			...empty(),
			'svelte-check': { 'src/new.ts': counts(1) }
		});
		expect(result.rises).toEqual([
			{ tool: 'svelte-check', file: 'src/new.ts', severity: 'errors', baseline: 0, current: 1 }
		]);
		expect(result.failed).toBe(true);
	});

	it('reports a fixed error and builds a lower next baseline', () => {
		const result = compareCounts(
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(2) } },
			{ ...empty(), 'svelte-check': { 'src/a.ts': counts(1) } }
		);
		expect(result.drops).toEqual([
			{ tool: 'svelte-check', file: 'src/a.ts', severity: 'errors', baseline: 2, current: 1 }
		]);
		expect(result.nextBaseline['svelte-check']).toEqual({ 'src/a.ts': counts(1) });
		expect(result.failed).toBe(false);
	});

	it('reports neither rises nor drops for equal counts', () => {
		const baseline = { ...empty(), eslint: { 'src/a.ts': counts(2, 1) } };
		const result = compareCounts(baseline, baseline);
		expect(result.rises).toEqual([]);
		expect(result.drops).toEqual([]);
		expect(result.failed).toBe(false);
	});

	it('never offsets a rise in one file with a drop in another', () => {
		const result = compareCounts(
			{ ...empty(), eslint: { 'src/a.ts': counts(2), 'src/b.ts': counts(1) } },
			{ ...empty(), eslint: { 'src/a.ts': counts(1), 'src/b.ts': counts(2) } }
		);
		expect(result.drops).toHaveLength(1);
		expect(result.rises).toHaveLength(1);
		expect(result.failed).toBe(true);
	});

	it.each(['svelte-check', 'eslint'] as const)('ratchets %s warnings independently', (tool) => {
		const result = compareCounts(
			{ ...empty(), [tool]: { 'src/a.ts': counts(1, 1), 'src/b.ts': counts(0, 2) } },
			{ ...empty(), [tool]: { 'src/a.ts': counts(1, 2), 'src/b.ts': counts(0, 1) } }
		);
		expect(result.rises).toEqual([
			{ tool, file: 'src/a.ts', severity: 'warnings', baseline: 1, current: 2 }
		]);
		expect(result.drops).toEqual([
			{ tool, file: 'src/b.ts', severity: 'warnings', baseline: 2, current: 1 }
		]);
		expect(result.failed).toBe(true);
	});

	it('removes files that reach zero from the next baseline', () => {
		const result = compareCounts(
			{ ...empty(), eslint: { 'src/a.ts': counts(1), 'src/b.ts': counts(0, 1) } },
			{ ...empty(), eslint: { 'src/a.ts': counts(0) } }
		);
		expect(result.nextBaseline).toEqual(empty());
		expect(result.drops).toHaveLength(2);
	});
});

describe('baseline serialization', () => {
	it('sorts keys, omits zero counts, uses tabs and ends with a newline', () => {
		expect(
			serializeBaseline({
				'svelte-check': {},
				eslint: { 'src/z.ts': counts(0), 'src/b.ts': counts(0, 1), 'src/a.ts': counts(2) }
			})
		).toBe(
			'{\n\t"eslint": {\n\t\t"src/a.ts": {\n\t\t\t"errors": 2,\n\t\t\t"warnings": 0\n\t\t},\n\t\t"src/b.ts": {\n\t\t\t"errors": 0,\n\t\t\t"warnings": 1\n\t\t}\n\t},\n\t"svelte-check": {}\n}\n'
		);
	});
});
