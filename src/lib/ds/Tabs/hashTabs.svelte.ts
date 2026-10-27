import { onMount, tick } from 'svelte';
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
	onMount(() => {
		let alive = true;
		let revision = 0;
		async function sync(user: boolean) {
			const version = ++revision;
			const hash = window.location.hash;
			const result = resolveHash(hash, ids, fallback, legacy);
			current = result.id;
			if (result.replace) {
				// These modules are browser-only; importing the barrel must also work in node SSR.
				const [{ replaceState }, { page }] = await Promise.all([
					import('$app/navigation'),
					import('$app/state')
				]);
				// Kit 2.70 sets `started` after hydration and enter callbacks, not at onMount.
				await new Promise<void>((resolve) => setTimeout(resolve));
				if (!alive || version !== revision || window.location.hash !== hash) return;
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
		window.addEventListener('hashchange', onHashChange);
		void sync(false);
		return () => {
			alive = false;
			window.removeEventListener('hashchange', onHashChange);
		};
	});
	return {
		get current() {
			return current;
		}
	};
}
