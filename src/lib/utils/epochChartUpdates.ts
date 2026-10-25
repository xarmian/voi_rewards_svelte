export interface EpochChartInputs {
	epochs: readonly unknown[];
	priceHistory: readonly unknown[];
	dark: boolean;
}

// TASK-31: transaction state is deliberately not a chart input.
export function getEpochChartUpdates(previous: EpochChartInputs | null, next: EpochChartInputs) {
	const themeChanged = previous === null || previous.dark !== next.dark;
	const epochsChanged = themeChanged || previous?.epochs !== next.epochs;
	return {
		apr: epochsChanged,
		stake: epochsChanged,
		price: themeChanged || previous?.priceHistory !== next.priceHistory
	};
}
