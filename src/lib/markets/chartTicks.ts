import type { Time } from 'lightweight-charts';

export function tickTimestamp(time: Time | number): number {
	if (typeof time === 'number') return time;
	if (typeof time === 'string') return Date.parse(time) / 1000;
	return Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

export function formatChartTick(time: Time | number, visibleSeconds: number): string {
	const date = new Date(tickTimestamp(time) * 1000);
	if (
		visibleSeconds > 86400 &&
		date.getUTCHours() === 0 &&
		date.getUTCMinutes() === 0 &&
		date.getUTCSeconds() === 0
	) {
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}
	return date.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: 'UTC'
	});
}
