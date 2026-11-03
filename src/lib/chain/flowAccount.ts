import { writable } from 'svelte/store';

// Live captured-account flows across the app, so the wallet page can tell a flow is open.
export const pinnedFlows = writable(0);

export function createFlowPin() {
	let address: string | undefined;
	let counted = false;

	function uncount(): void {
		if (!counted) return;
		counted = false;
		pinnedFlows.update((count) => count - 1);
	}

	return {
		pin(nextAddress: string): void {
			if (!counted) {
				counted = true;
				pinnedFlows.update((count) => count + 1);
			}
			address = nextAddress;
		},
		release(): void {
			address = undefined;
			uncount();
		},
		// For a component destroyed mid-flow: stop counting, keep the captured account for any
		// async work that is still running.
		dispose(): void {
			uncount();
		},
		current(selected: string | undefined): string | undefined {
			return address ?? selected;
		},
		get pinned(): boolean {
			return address !== undefined;
		},
		get address(): string | undefined {
			return address;
		}
	};
}
