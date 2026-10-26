import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';

export function sparklinePath(values: number[], width: number, height: number, padding: number) {
	values = values.filter(Number.isFinite);
	if (!values.length) return { line: '', area: '', end: null };
	const x = scaleLinear()
		.domain([0, Math.max(1, values.length - 1)])
		.range([padding, width - padding]);
	const y = scaleLinear()
		.domain([Math.min(...values), Math.max(...values)])
		.range([height - padding, padding]);
	// A singleton marks the latest sample at the same right edge as a full series.
	const points: [number, number][] = values.map((value, i) => [
		values.length === 1 ? width - padding : x(i),
		y(value)
	]);
	return {
		line:
			line<[number, number]>()
				.x((d) => d[0])
				.y((d) => d[1])
				.curve(curveMonotoneX)(points) ?? '',
		area:
			area<[number, number]>()
				.x((d) => d[0])
				.y0(height - padding)
				.y1((d) => d[1])
				.curve(curveMonotoneX)(points) ?? '',
		end: { x: points[points.length - 1][0], y: points[points.length - 1][1] }
	};
}
