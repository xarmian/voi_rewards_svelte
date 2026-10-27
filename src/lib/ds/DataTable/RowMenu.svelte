<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	let {
		id,
		name,
		trigger,
		onclose,
		children
	}: {
		id: string;
		name: string;
		trigger: HTMLButtonElement;
		onclose: (restoreFocus: boolean) => void;
		/** Native buttons with role="menuitem"; this menu owns their keyboard navigation. */
		children: Snippet;
	} = $props();
	function menu(node: HTMLDivElement) {
		const items = () =>
			Array.from(node.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
				(item) => !item.matches(':disabled')
			);
		void tick().then(() => {
			if (node.isConnected) items()[0]?.focus();
		});
		function keydown(event: KeyboardEvent) {
			const entries = items();
			const current = entries.indexOf(document.activeElement as HTMLElement);
			let next: number;
			switch (event.key) {
				case 'ArrowDown':
					next = (current + 1) % entries.length;
					break;
				case 'ArrowUp':
					next = (current - 1 + entries.length) % entries.length;
					break;
				case 'Home':
					next = 0;
					break;
				case 'End':
					next = entries.length - 1;
					break;
				case 'Escape':
					event.preventDefault();
					event.stopPropagation();
					onclose(true);
					return;
				case 'Tab':
					for (const item of entries) item.tabIndex = -1;
					trigger.focus();
					onclose(false);
					return;
				default:
					return;
			}
			event.preventDefault();
			entries[next]?.focus();
		}
		function click(event: MouseEvent) {
			if (event.target instanceof Element && event.target.closest('[role="menuitem"]'))
				onclose(true);
		}
		function outside(event: PointerEvent) {
			if (
				event.target instanceof Node &&
				!node.contains(event.target) &&
				!trigger.contains(event.target)
			)
				onclose(false);
		}
		node.addEventListener('keydown', keydown);
		node.addEventListener('click', click);
		document.addEventListener('pointerdown', outside);
		return {
			destroy() {
				node.removeEventListener('keydown', keydown);
				node.removeEventListener('click', click);
				document.removeEventListener('pointerdown', outside);
			}
		};
	}
</script>

<div
	{id}
	role="menu"
	aria-label="Actions for {name}"
	use:menu
	class="absolute right-0 top-full z-10 w-44 max-w-[80vw] rounded-ds-sm border border-line bg-surface p-1 text-start text-sm text-ink shadow-pop"
>
	{@render children()}
</div>
