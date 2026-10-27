const FIRST_EPOCH = Date.UTC(2024, 9, 30);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const monthDay = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});

export function epochAt(date: Date): number {
	return Math.floor((date.getTime() - FIRST_EPOCH) / WEEK_MS) + 1;
}

export function epochRange(epoch: number): { start: Date; end: Date; id: string; label: string } {
	const start = new Date(FIRST_EPOCH + (epoch - 1) * WEEK_MS);
	const end = new Date(start.getTime() + WEEK_MS - 1);
	const idDate = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '');
	return {
		start,
		end,
		id: `${idDate(start)}-${idDate(end)}`,
		label: `${monthDay.format(start)} – ${monthDay.format(end)}, ${end.getUTCFullYear()}`
	};
}
