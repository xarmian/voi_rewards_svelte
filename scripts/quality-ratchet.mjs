import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = ['svelte-check', 'eslint'];
const severities = ['errors', 'warnings'];

function countDiagnostics(diagnostics) {
	const counts = {};
	for (const { file, identity, severity } of diagnostics) {
		counts[file] ??= {};
		counts[file][identity] ??= { errors: 0, warnings: 0 };
		counts[file][identity][severity]++;
	}
	return counts;
}

function normalizeFile(file, repoRoot) {
	return relative(repoRoot, resolve(repoRoot, file.replaceAll('\\', '/'))).replaceAll('\\', '/');
}

export function parseSvelteCheck(
	output,
	repoRoot = fileURLToPath(new URL('../', import.meta.url))
) {
	const diagnostics = [];
	let completed = false;
	for (const line of output.split('\n')) {
		if (/^\d+ COMPLETED(?:\s|$)/.test(line)) completed = true;
		if (!/^\d+ \{/.test(line)) continue;
		let diagnostic;
		try {
			diagnostic = JSON.parse(line.slice(line.indexOf(' ') + 1));
			const { type, filename, start, message, code, source } = diagnostic;
			if (
				!['ERROR', 'WARNING'].includes(type) ||
				typeof filename !== 'string' ||
				typeof message !== 'string' ||
				!Number.isSafeInteger(start?.line) ||
				start.line < 0 ||
				!Number.isSafeInteger(start?.character) ||
				start.character < 0 ||
				(code != null &&
					(!['number', 'string'].includes(typeof code) || typeof source !== 'string'))
			) {
				throw new Error('Invalid diagnostic fields');
			}
		} catch {
			throw new Error(`Malformed svelte-check diagnostic: ${line}`);
		}
		const { type, filename, start, message, code, source } = diagnostic;
		diagnostics.push({
			file: normalizeFile(filename, repoRoot),
			identity: code == null ? `message:${message.split(/\r?\n/)[0]}` : `${source}:${code}`,
			severity: type === 'ERROR' ? 'errors' : 'warnings',
			line: start.line + 1,
			column: start.character + 1,
			message
		});
	}
	return { completed, counts: countDiagnostics(diagnostics), diagnostics };
}

export function parseEslint(output, repoRoot) {
	const results = JSON.parse(output);
	if (!Array.isArray(results)) throw new Error('Expected an ESLint JSON results array');
	const diagnostics = [];
	for (const result of results) {
		if (typeof result.filePath !== 'string' || !Array.isArray(result.messages)) {
			throw new Error('Invalid ESLint JSON result');
		}
		const file = normalizeFile(result.filePath, repoRoot);
		for (const message of result.messages) {
			if (
				![1, 2].includes(message.severity) ||
				typeof message.message !== 'string' ||
				(message.ruleId !== null && typeof message.ruleId !== 'string')
			) {
				throw new Error(`Invalid ESLint diagnostic for ${file}`);
			}
			diagnostics.push({
				file,
				identity: message.ruleId ?? `fatal:${message.message.split(/\r?\n/)[0]}`,
				severity: message.fatal || message.severity === 2 ? 'errors' : 'warnings',
				line: message.line ?? 0,
				column: message.column ?? 0,
				message: message.message
			});
		}
	}
	return { counts: countDiagnostics(diagnostics), diagnostics };
}

export function buildBaseline(counts) {
	const baseline = {};
	for (const tool of [...tools].sort()) {
		baseline[tool] = {};
		for (const file of Object.keys(counts[tool]).sort()) {
			const identities = {};
			for (const identity of Object.keys(counts[tool][file]).sort()) {
				const { errors, warnings } = counts[tool][file][identity];
				if (errors || warnings) identities[identity] = { errors, warnings };
			}
			if (Object.keys(identities).length) baseline[tool][file] = identities;
		}
	}
	return baseline;
}

export function compareCounts(baseline, current) {
	const rises = [];
	const drops = [];
	for (const tool of tools) {
		const files = [...new Set([...Object.keys(baseline[tool]), ...Object.keys(current[tool])])];
		for (const file of files.sort()) {
			const identities = [
				...new Set([
					...Object.keys(baseline[tool][file] ?? {}),
					...Object.keys(current[tool][file] ?? {})
				])
			];
			for (const identity of identities.sort()) {
				for (const severity of severities) {
					const before = baseline[tool][file]?.[identity]?.[severity] ?? 0;
					const after = current[tool][file]?.[identity]?.[severity] ?? 0;
					const change = { tool, file, identity, severity, baseline: before, current: after };
					if (after > before) rises.push(change);
					if (after < before) drops.push(change);
				}
			}
		}
	}
	return { rises, drops, failed: rises.length > 0, nextBaseline: buildBaseline(current) };
}

export function serializeBaseline(counts) {
	return JSON.stringify(buildBaseline(counts), null, '\t') + '\n';
}

function totals(counts) {
	if (!counts) return { errors: 'unknown', warnings: 'unknown' };
	return Object.values(counts)
		.flatMap((identities) => Object.values(identities))
		.reduce(
			(total, counts) => ({
				errors: total.errors + counts.errors,
				warnings: total.warnings + counts.warnings
			}),
			{ errors: 0, warnings: 0 }
		);
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateBaseline(baseline) {
	if (!isObject(baseline)) throw new Error('Invalid baseline: expected an object');
	for (const tool of tools) {
		const files = baseline?.[tool];
		if (!isObject(files)) {
			throw new Error(`Invalid baseline for ${tool}`);
		}
		for (const [file, identities] of Object.entries(files)) {
			if (!isObject(identities)) throw new Error(`Invalid baseline identities: ${tool} ${file}`);
			if (severities.some((severity) => typeof identities[severity] === 'number')) {
				throw new Error(
					`Old baseline format: ${tool} ${file}; expected diagnostic identity objects`
				);
			}
			for (const [identity, counts] of Object.entries(identities)) {
				if (!isObject(counts)) {
					throw new Error(`Invalid baseline counts: ${tool} ${file} ${identity}`);
				}
				for (const severity of severities) {
					if (!Number.isSafeInteger(counts[severity]) || counts[severity] < 0) {
						throw new Error(`Invalid baseline count: ${tool} ${file} ${identity} ${severity}`);
					}
				}
			}
		}
	}
}

export function main(args = process.argv.slice(2), deps = {}) {
	const repoRoot = fileURLToPath(new URL('../', import.meta.url));
	const baselinePath = resolve(repoRoot, 'scripts/quality-baseline.json');
	const runCommand =
		deps.run ??
		((command, commandArgs, env) =>
			spawnSync(command, commandArgs, {
				cwd: repoRoot,
				env,
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024
			}));
	const readBaseline = deps.readBaseline ?? (() => readFileSync(baselinePath, 'utf8'));
	const writeBaseline = deps.writeBaseline ?? ((text) => writeFileSync(baselinePath, text));
	const log = deps.log ?? console.log;
	const logError = deps.error ?? console.error;
	let baseline;
	const current = {};
	try {
		for (const arg of args) {
			if (!['--update', '--frozen'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
		}
		const update = args.includes('--update');
		try {
			const parsed = JSON.parse(readBaseline());
			validateBaseline(parsed);
			baseline = parsed;
		} catch (error) {
			if (!update || error.code !== 'ENOENT') throw error;
			baseline = { 'svelte-check': {}, eslint: {} };
		}

		// Override inherited values so every invocation sees the same static env types.
		const env = { ...process.env };
		for (const name of [
			'PUBLIC_SUPABASE_URL',
			'PUBLIC_SUPABASE_ANON_KEY',
			'PUBLIC_MIMIR_URL',
			'PUBLIC_MIMIR_ANON_KEY',
			'PUBLIC_WALLETCONNECT_PROJECT_ID',
			'PUBLIC_DS_GALLERY',
			'PRIVATE_SUPABASE_ROLE_KEY'
		]) {
			env[name] = 'x';
		}
		const run = (command, commandArgs, expectedStatuses = [0]) => {
			const result = runCommand(command, commandArgs, env);
			if (result.error || !expectedStatuses.includes(result.status)) {
				throw new Error(
					`${command} ${commandArgs.join(' ')} failed (${result.error?.message ?? result.signal ?? result.status})\n${result.stderr ?? ''}`
				);
			}
			return result.stdout;
		};
		run(process.execPath, ['scripts/generateFaqData.js']);
		run('npx', ['svelte-kit', 'sync']);
		const svelte = parseSvelteCheck(
			run(
				'npx',
				['svelte-check', '--tsconfig', './tsconfig.json', '--output', 'machine-verbose'],
				[0, 1]
			),
			repoRoot
		);
		if (!svelte.completed) throw new Error('svelte-check did not complete: missing COMPLETED line');
		current['svelte-check'] = svelte.counts;
		let eslint;
		try {
			eslint = parseEslint(run('npx', ['eslint', '.', '--format', 'json'], [0, 1]), repoRoot);
		} catch (error) {
			throw new Error(`ESLint did not produce valid completed JSON results: ${error.message}`);
		}
		current.eslint = eslint.counts;
		const comparison = compareCounts(baseline, current);
		const diagnostics = { 'svelte-check': svelte.diagnostics, eslint: eslint.diagnostics };
		for (const [label, changes] of [
			['RISE', comparison.rises],
			['DROP', comparison.drops]
		]) {
			for (const change of changes) {
				const { tool, file, identity, severity, baseline: before, current: after } = change;
				log(`${label} ${tool} ${file} ${identity} ${severity} ${before} -> ${after}`);
				if (label === 'RISE') {
					for (const diagnostic of diagnostics[tool]) {
						if (
							diagnostic.file !== file ||
							diagnostic.identity !== identity ||
							diagnostic.severity !== severity
						) {
							continue;
						}
						log(
							`  ${file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message.split(/\r?\n/)[0]}`
						);
					}
				}
			}
		}
		if (update) {
			writeBaseline(serializeBaseline(comparison.nextBaseline));
			log('quality-ratchet: updated; commit scripts/quality-baseline.json');
			return 0;
		}
		if (comparison.failed) return 1;
		if (comparison.drops.length) {
			if (args.includes('--frozen')) {
				log(
					'quality-ratchet: committed baseline is stale and must be lowered; run npm run check:ratchet and commit scripts/quality-baseline.json'
				);
				return 1;
			}
			writeBaseline(serializeBaseline(comparison.nextBaseline));
			log('quality-ratchet: lowered baseline; commit scripts/quality-baseline.json');
		} else {
			log('quality-ratchet: equal');
		}
		return 0;
	} catch (error) {
		logError(`quality-ratchet: ${error.message}`);
		return 2;
	} finally {
		const summary = tools.map((tool) => {
			const now = totals(current[tool]);
			const before = totals(baseline?.[tool]);
			return `${tool} ${now.errors} errors ${now.warnings} warnings (baseline ${before.errors}/${before.warnings})`;
		});
		log(`quality-ratchet: ${summary.join('; ')}`);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
