export function createFlowPin() {
	let address: string | undefined;
	return {
		pin(nextAddress: string): void {
			address = nextAddress;
		},
		release(): void {
			address = undefined;
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
