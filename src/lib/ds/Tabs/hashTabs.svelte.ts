import { onMount, tick } from 'svelte';
import { afterNavigate } from '$app/navigation';
import { browser } from '$app/environment';
import { LEGACY_HASHES, resolveHash } from './hash';
export type HashTabsOptions = {
	ids: readonly string[];
	fallback?: string;
	legacy?: Readonly<Record<string, string>>;
	/** The caller gives this container tabindex="-1" so user hash changes can focus it. */
	panel?: () => HTMLElement | undefined;
};
export function createHashTabs({
	ids,
	fallback = 'overview',
	legacy = LEGACY_HASHES,
	panel
}: HashTabsOptions) {
	let current = $state(fallback);
	let hash = $state('');
	let revision = $state(0);
	let resync = () => {};
	if (browser) afterNavigate(() => resync());
	onMount(() => {
		let alive = true;
		async function sync(user: boolean) {
			const version = ++revision;
			hash = window.location.hash;
			const requestedHash = hash;
			const result = resolveHash(hash, ids, fallback, legacy);
			current = result.id;
			if (result.replace) {
				// Read Kit state only in the browser.
				const [{ replaceState }, { page }] = await Promise.all([
					import('$app/navigation'),
					import('$app/state')
				]);
				// Kit 2.70 sets `started` after hydration and enter callbacks, not at onMount.
				await new Promise<void>((resolve) => setTimeout(resolve));
				if (!alive || version !== revision || window.location.hash !== requestedHash) return;
				replaceState(result.replace, page.state);
			}
			if (user) {
				await tick();
				if (alive && version === revision) panel?.()?.focus();
			}
		}
		const onHashChange = () => {
			void sync(true);
		};
		resync = () => {
			void sync(false);
		};
		window.addEventListener('hashchange', onHashChange);
		void sync(false);
		return () => {
			alive = false;
			resync = () => {};
			window.removeEventListener('hashchange', onHashChange);
		};
	});
	return {
		// A fresh navigation can request the same legacy hash after URL normalization.
		get revision() {
			return revision;
		},
		get hash() {
			return hash;
		},
		get current() {
			return current;
		}
	};
}
