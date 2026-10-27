export function layoutAnnotations(
	items: { x: number; width: number }[],
	plotWidth: number
): { anchor: 'start' | 'end'; row: number }[] {
	const rows: { start: number; end: number }[][] = [];
	return items.map((item) => {
		const width = Math.min(item.width, plotWidth);
		const anchor = item.x + width > plotWidth ? 'end' : 'start';
		const start = Math.max(
			0,
			Math.min(plotWidth - width, anchor === 'end' ? item.x - width : item.x)
		);
		const end = start + width;
		let row = rows.findIndex((spans) =>
			spans.every((span) => end + 8 <= span.start || start >= span.end + 8)
		);
		if (row < 0) {
			row = rows.length;
			rows.push([]);
		}
		rows[row].push({ start, end });
		return { anchor, row };
	});
}
