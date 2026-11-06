import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// TASK-174: every dependency comes from the npm registry. A dependency fetched from git
// needs a git client and network access to the host at install time, and an install that
// forbids git fetches (npm's allow-git=none) cannot complete at all. A floating
// `github:owner/repo` spec also tracks a branch instead of a release.

type Manifest = {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	overrides?: unknown;
};
type Lock = {
	packages?: Record<string, { resolved?: string } & Manifest>;
};

const DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies'
] as const;

// Specs that name something other than a registry version or range: git hosts, the
// `owner/repo` shorthand for GitHub, and remote URLs (git over https, or a tarball).
const OFF_REGISTRY_SPEC =
	/^(git\+|git:|git@|ssh:|github:|gitlab:|bitbucket:|gist:|https?:\/\/|[\w.-]+\/[\w.-]+(#.*)?$)/;
// Where a lock entry was actually fetched from.
const GIT_RESOLVED = /^(git\+|git:|git@|ssh:|github:|gitlab:|bitbucket:|gist:)|\.git(#|$)/;

function offRegistrySpecs(manifest: Manifest): string[] {
	const found: string[] = [];
	for (const field of DEPENDENCY_FIELDS) {
		for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
			if (OFF_REGISTRY_SPEC.test(spec)) found.push(`${field}.${name}: ${spec}`);
		}
	}
	const walk = (node: unknown, path: string) => {
		if (typeof node === 'string') {
			if (OFF_REGISTRY_SPEC.test(node)) found.push(`${path}: ${node}`);
		} else if (node && typeof node === 'object') {
			for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
		}
	};
	walk(manifest.overrides, 'overrides');
	return found;
}

function gitResolutions(lock: Lock): string[] {
	const found: string[] = [];
	for (const [path, entry] of Object.entries(lock.packages ?? {})) {
		if (entry.resolved && GIT_RESOLVED.test(entry.resolved))
			found.push(`${path || '(root)'}: ${entry.resolved}`);
		// The root entry and any nested package also declare specs of their own.
		for (const offending of offRegistrySpecs(entry)) found.push(`${path || '(root)'} ${offending}`);
	}
	return found;
}

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));

describe('no git dependencies', () => {
	it('package.json declares no dependency from git, a shorthand repo or a URL', () => {
		expect(offRegistrySpecs(read('../package.json'))).toEqual([]);
	});

	it('package-lock.json resolves nothing from git and declares no off-registry spec', () => {
		expect(gitResolutions(read('../package-lock.json'))).toEqual([]);
	});
});

// A guard that cannot fail proves nothing: these feed it the shapes that must be caught.
describe('the guard recognises off-registry dependencies', () => {
	it.each([
		'github:d3/d3-scale',
		'd3/d3-scale',
		'd3/d3-scale#semver:^4',
		'git+ssh://git@github.com/d3/d3-scale.git#d6904a4bde09e16005e0ad8ca3e25b10ce54fa0d',
		'git+https://github.com/d3/d3-scale.git',
		'git://github.com/d3/d3-scale.git',
		'git@github.com:d3/d3-scale.git',
		'gitlab:owner/repo',
		'https://example.com/pkg-1.0.0.tgz'
	])('manifest spec %s is reported', (spec) => {
		expect(offRegistrySpecs({ dependencies: { pkg: spec } })).toHaveLength(1);
		expect(offRegistrySpecs({ devDependencies: { pkg: spec } })).toHaveLength(1);
		expect(offRegistrySpecs({ overrides: { outer: { pkg: spec } } })).toHaveLength(1);
	});

	it.each([
		'4.0.2',
		'^4.0.2',
		'~1.2.3',
		'>=1 <3',
		'*',
		'latest',
		'npm:@scope/other@^1.0.0',
		'file:../local-package'
	])('manifest spec %s is allowed', (spec) => {
		expect(offRegistrySpecs({ dependencies: { pkg: spec } })).toEqual([]);
	});

	it.each([
		'git+ssh://git@github.com/d3/d3-scale.git#d6904a4bde09e16005e0ad8ca3e25b10ce54fa0d',
		'git+https://github.com/d3/d3-scale.git#main',
		'https://github.com/d3/d3-scale.git#abc123'
	])('lock resolution %s is reported', (resolved) => {
		expect(gitResolutions({ packages: { 'node_modules/d3-scale': { resolved } } })).toHaveLength(1);
	});

	it('reports an off-registry spec declared by the lock root', () => {
		const lock: Lock = { packages: { '': { dependencies: { 'd3-scale': 'github:d3/d3-scale' } } } };
		expect(gitResolutions(lock)).toHaveLength(1);
	});

	it('allows registry resolutions', () => {
		const resolved = 'https://registry.npmjs.org/d3-scale/-/d3-scale-4.0.2.tgz';
		expect(gitResolutions({ packages: { 'node_modules/d3-scale': { resolved } } })).toEqual([]);
	});
});
