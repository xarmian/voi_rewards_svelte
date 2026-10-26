import { describe, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import {
	createTheme,
	initTheme,
	onThemeChange,
	setTheme,
	theme,
	type Theme,
	type ThemeEnv
} from './theme.svelte';

function fakeEnv(initial: Theme = 'light', source: string | undefined = 'system') {
	const classes = new Set(initial === 'dark' ? ['dark'] : []);
	const listeners = new Set<(event: { matches: boolean }) => void>();
	const writes: [string, string][] = [];
	let adds = 0;
	let removes = 0;
	const env: ThemeEnv = {
		root: {
			classList: {
				contains: (name) => classes.has(name),
				toggle: (name, on) => {
					if (on) classes.add(name);
					else classes.delete(name);
				}
			},
			dataset: { themeSource: source }
		},
		storage: {
			getItem: () => {
				throw new Error('Initial state must come from the root');
			},
			setItem: (key, value) => {
				writes.push([key, value]);
			}
		},
		media: {
			matches: initial !== 'dark',
			addEventListener: (type, callback) => {
				assert.equal(type, 'change');
				adds += 1;
				listeners.add(callback);
			},
			removeEventListener: (type, callback) => {
				assert.equal(type, 'change');
				removes += 1;
				listeners.delete(callback);
			}
		}
	};
	return {
		env,
		writes,
		listeners,
		get adds() {
			return adds;
		},
		get removes() {
			return removes;
		},
		emit: (matches: boolean) => listeners.forEach((callback) => callback({ matches }))
	};
}

describe('createTheme', () => {
	test('adopts the root theme and valid source, defaulting unknown sources to system', () => {
		for (const initial of ['light', 'dark'] as const) {
			for (const source of ['user', 'system', 'forced', 'junk', undefined]) {
				const { env, writes } = fakeEnv(initial, source);
				env.root.dataset.themeSource = source;
				const owner = createTheme(env);
				assert.equal(owner.current, initial);
				assert.equal(owner.source, source === 'user' || source === 'forced' ? source : 'system');
				assert.deepEqual(writes, []);
				owner.destroy();
			}
		}
	});

	test('set persists, updates root and source before notifying, and only notifies on change', () => {
		const { env, writes } = fakeEnv();
		const owner = createTheme(env);
		const changes: Theme[] = [];
		owner.onChange((value) => {
			assert.equal(owner.current, value);
			assert.equal(owner.source, 'user');
			assert.equal(env.root.dataset.themeSource, 'user');
			assert.equal(env.root.classList.contains('dark'), value === 'dark');
			changes.push(value);
		});
		assert.deepEqual(changes, []);
		owner.set('dark');
		assert.deepEqual(writes, [['color-theme', 'dark']]);
		owner.set('dark');
		assert.deepEqual(changes, ['dark']);
		owner.set('light');
		assert.deepEqual(changes, ['dark', 'light']);
		owner.destroy();
	});

	test('OS changes apply only until a user chooses a theme, including the current theme', () => {
		const { env, emit, writes } = fakeEnv();
		const owner = createTheme(env);
		const changes: Theme[] = [];
		owner.onChange((value) => changes.push(value));
		emit(true);
		emit(true);
		assert.equal(owner.current, 'dark');
		assert.equal(env.root.classList.contains('dark'), true);
		assert.equal(owner.source, 'system');
		assert.equal(env.root.dataset.themeSource, 'system');
		assert.deepEqual(changes, ['dark']);
		assert.deepEqual(writes, []);
		emit(false);
		assert.equal(owner.current, 'light');
		assert.deepEqual(changes, ['dark', 'light']);
		owner.set('light');
		emit(true);
		assert.equal(owner.current, 'light');
		assert.equal(owner.source, 'user');
		assert.deepEqual(changes, ['dark', 'light']);
		owner.destroy();
	});

	test('OS changes respect forced and stored user themes', () => {
		for (const source of ['forced', 'user']) {
			const { env, emit, writes } = fakeEnv('light', source);
			const owner = createTheme(env);
			const changes: Theme[] = [];
			owner.onChange((value) => changes.push(value));
			emit(true);
			assert.equal(owner.current, 'light');
			assert.equal(owner.source, source);
			assert.equal(env.root.classList.contains('dark'), false);
			assert.deepEqual(changes, []);
			assert.deepEqual(writes, []);
			owner.destroy();
		}
	});

	test('blocked or absent storage does not prevent a user choice', () => {
		for (const storage of [
			null,
			{
				getItem: () => null,
				setItem: () => {
					throw new Error('Storage blocked');
				}
			}
		]) {
			const { env } = fakeEnv('light', 'forced');
			env.storage = storage;
			env.media = null;
			const owner = createTheme(env);
			owner.set('dark');
			assert.equal(owner.current, 'dark');
			assert.equal(owner.source, 'user');
			assert.equal(env.root.classList.contains('dark'), true);
			owner.destroy();
		}
	});

	test('unsubscribe stops callbacks and destroy removes the media listener', () => {
		const fixture = fakeEnv();
		const owner = createTheme(fixture.env);
		const changes: Theme[] = [];
		const unsubscribe = owner.onChange((value) => changes.push(value));
		fixture.emit(true);
		unsubscribe();
		fixture.emit(false);
		assert.deepEqual(changes, ['dark']);
		assert.equal(fixture.adds, 1);
		owner.destroy();
		assert.equal(fixture.removes, 1);
		assert.equal(fixture.listeners.size, 0);
		fixture.emit(true);
		assert.equal(owner.current, 'light');
	});
});

describe('theme singleton', () => {
	test('is safe on the server', () => {
		assert.equal(typeof document, 'undefined');
		assert.equal(theme.current, 'light');
		assert.equal(theme.source, 'system');
		assert.doesNotThrow(() => {
			initTheme();
			setTheme('dark');
		});
		const unsubscribe = onThemeChange(() => assert.fail('Server must not notify'));
		assert.doesNotThrow(unsubscribe);
		assert.equal(theme.current, 'light');
	});

	test('init starts one browser listener before any consumer reads the theme', () => {
		const fixture = fakeEnv('dark');
		vi.stubGlobal('document', { documentElement: fixture.env.root });
		vi.stubGlobal('localStorage', fixture.env.storage);
		vi.stubGlobal('matchMedia', (query: string) => {
			assert.equal(query, '(prefers-color-scheme: dark)');
			return fixture.env.media;
		});
		try {
			initTheme();
			initTheme();
			assert.equal(fixture.adds, 1);
			fixture.emit(false);
			assert.equal(theme.current, 'light');
			const changes: Theme[] = [];
			const unsubscribe = onThemeChange((value) => changes.push(value));
			setTheme('dark');
			assert.equal(theme.current, 'dark');
			assert.equal(theme.source, 'user');
			assert.deepEqual(changes, ['dark']);
			assert.deepEqual(fixture.writes, [['color-theme', 'dark']]);
			unsubscribe();
			assert.equal(fixture.adds, 1);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
