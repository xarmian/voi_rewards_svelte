export type XSpec =
	| { kind: 'band'; values: (number | string)[] }
	| { kind: 'time'; domain: [Date, Date] }
	| { kind: 'linear'; domain: [number, number] };
export type Annotation = {
	id: string;
	at: number | string | [number | string, number | string];
	label: string;
	detail?: string;
	tone: 'hi' | 'neutral';
};
export type ChartContext = {
	width: number;
	height: number;
	/** Band coordinates are left edges; add bandwidth / 2 for a line point or tick. */
	x: (v: number | string | Date) => number;
	bandwidth: number;
	y: (v: number) => number;
	margin: { top: number; right: number; bottom: number; left: number };
};
export type ChartData = { columns: string[]; rows: (string | number)[][]; caption: string };
export type ChartLegend = { label: string; swatch: 'fill' | 'hi' | 'expected' | 'series-3' };
