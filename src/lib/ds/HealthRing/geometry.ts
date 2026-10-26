export function ringArc(value: number, total: number, size = 110, stroke = 12) {
	const r = (size - stroke) / 2;
	const circumference = 2 * Math.PI * r;
	const fraction = total > 0 ? Math.min(total, Math.max(0, value)) / total : 0;
	return { r, circumference, dashOffset: circumference * (1 - fraction) };
}
