import type { Annotation } from '$lib/ds/charts/types';
export type ChartEvent = {
	id: string;
	from: string;
	to?: string;
	epochs?: number[];
	short: string;
	long: string;
	charts: ('onlineStake' | 'blocksVsExpected' | 'apr')[];
};
export const chartEvents: ChartEvent[] = [
	{
		id: 'offline-drop-2026-10',
		from: '2026-10-08',
		to: '2026-10-12',
		epochs: [102],
		short: '~243M VOI went offline',
		long: 'Oct 8-12: ~243M VOI went offline, so everyone still online proposed more blocks than their stake predicted.',
		charts: ['onlineStake', 'blocksVsExpected', 'apr']
	}
];
export function annotationsFor(
	chart: ChartEvent['charts'][number],
	axis: 'epoch' | 'date'
): Annotation[] {
	return chartEvents
		.filter((event) => event.charts.includes(chart) && (axis === 'date' || event.epochs?.length))
		.map((event) => {
			const epochs = event.epochs ?? [];
			return {
				id: event.id,
				at:
					axis === 'date'
						? [event.from, event.to ?? event.from]
						: epochs.length === 1
							? epochs[0]
							: [epochs[0], epochs[epochs.length - 1]],
				label: event.short,
				detail: event.long,
				tone: 'hi'
			};
		});
}
