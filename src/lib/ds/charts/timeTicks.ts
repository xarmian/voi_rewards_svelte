const DAY = 86400000;

const monthDay = (date: Date) =>
	date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const month = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const hourMinute = (date: Date) =>
	`${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;

export const isUtcMidnight = (date: Date) => date.getTime() % DAY === 0;

/**
 * Keeps only UTC-midnight ticks on a domain of two days or more, so a multi-day axis never prints a
 * date twice. If the tick hint leaves fewer than two, every UTC midnight in the domain is returned
 * and the caller's spacing filter thins them.
 */
export function dailyTicks(ticks: Date[], domain: [Date, Date]): Date[] {
	const [lo, hi] = domain.map(Number).sort((a, b) => a - b);
	if (!(hi - lo >= 2 * DAY)) return ticks;
	const midnights = ticks.filter(isUtcMidnight);
	if (midnights.length >= 2) return midnights;
	const days: Date[] = [];
	for (let t = Math.ceil(lo / DAY) * DAY; t <= hi; t += DAY) days.push(new Date(t));
	return days;
}

/**
 * One UTC label per tick, chosen from the spacing of the whole set: times on a sub-day axis, month
 * and day within one year, and on a multi-year axis the year on the first tick and at each change.
 */
export function timeTickLabels(ticks: Date[]): string[] {
	const step = Math.min(
		Infinity,
		...ticks.slice(1).map((tick, i) => Math.abs(tick.getTime() - ticks[i].getTime()))
	);
	if (step < DAY)
		return ticks.map((tick, i) =>
			i === 0 || isUtcMidnight(tick) ? monthDay(tick) : hourMinute(tick)
		);
	const years = ticks.map((tick) => tick.getUTCFullYear());
	if (new Set(years).size <= 1) return ticks.map(monthDay);
	return ticks.map((tick, i) => {
		const year = years[i];
		const marked = i === 0 || year !== years[i - 1];
		if (step >= 365 * DAY) return String(year);
		if (step >= 28 * DAY) return marked ? `${month(tick)} ${year}` : month(tick);
		return marked ? `${monthDay(tick)}, ${year}` : monthDay(tick);
	});
}
