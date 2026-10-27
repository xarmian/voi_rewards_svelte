export type Theme = 'light' | 'dark';
export type ThemeSource = 'user' | 'system' | 'forced';
export type ThemeEnv = {
	root: {
		classList: { contains(c: string): boolean; toggle(c: string, on: boolean): void };
		dataset: Record<string, string | undefined>;
	};
	storage: Pick<Storage, 'getItem' | 'setItem'> | null;
	media: {
		matches: boolean;
		addEventListener(t: 'change', f: (e: { matches: boolean }) => void): void;
		removeEventListener(t: 'change', f: (e: { matches: boolean }) => void): void;
	} | null;
};

export function createTheme(env: ThemeEnv) {
	let current = $state<Theme>(env.root.classList.contains('dark') ? 'dark' : 'light');
	const initialSource = env.root.dataset.themeSource;
	let source = $state<ThemeSource>(
		initialSource === 'user' || initialSource === 'forced' ? initialSource : 'system'
	);
	const callbacks = new Set<(t: Theme) => void>();

	function apply(t: Theme, nextSource: ThemeSource) {
		const changed = t !== current;
		env.root.classList.toggle('dark', t === 'dark');
		env.root.dataset.themeSource = nextSource;
		current = t;
		source = nextSource;
		if (changed) callbacks.forEach((callback) => callback(t));
	}

	function onMediaChange(event: { matches: boolean }) {
		if (source === 'system') apply(event.matches ? 'dark' : 'light', 'system');
	}
	env.media?.addEventListener('change', onMediaChange);

	return {
		get current() {
			return current;
		},
		get source() {
			return source;
		},
		set(t: Theme) {
			try {
				env.storage?.setItem('color-theme', t);
			} catch {
				// Private browsing may block persistence; the page must still switch.
			}
			apply(t, 'user');
		},
		onChange(callback: (t: Theme) => void): () => void {
			callbacks.add(callback);
			return () => {
				callbacks.delete(callback);
			};
		},
		destroy() {
			env.media?.removeEventListener('change', onMediaChange);
			callbacks.clear();
		}
	};
}

let singleton: ReturnType<typeof createTheme> | undefined;

function getTheme() {
	if (typeof document === 'undefined') return undefined;
	if (!singleton) {
		let storage: ThemeEnv['storage'] = null;
		try {
			storage = localStorage;
		} catch {
			// Accessing storage itself may throw in restricted browser contexts.
		}
		singleton = createTheme({
			root: document.documentElement,
			storage,
			media: matchMedia('(prefers-color-scheme: dark)')
		});
	}
	return singleton;
}

export const theme: { readonly current: Theme; readonly source: ThemeSource } = {
	get current() {
		return getTheme()?.current ?? 'light';
	},
	get source() {
		return getTheme()?.source ?? 'system';
	}
};

export function setTheme(t: Theme): void {
	getTheme()?.set(t);
}

export function onThemeChange(callback: (t: Theme) => void): () => void {
	return getTheme()?.onChange(callback) ?? (() => {});
}

export function initTheme(): void {
	getTheme();
}
