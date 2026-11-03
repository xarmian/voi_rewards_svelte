import { writable } from 'svelte/store';

export const pinnedFlows = writable(0);

export function createFlowPin() {
	let address: string | undefined;
	return {
		pin(nextAddress: string): void {
			if (address === undefined) pinnedFlows.update((count) => count + 1);
			address = nextAddress;
		},
		release(): void {
			if (address === undefined) return;
			address = undefined;
			pinnedFlows.update((count) => count - 1);
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
