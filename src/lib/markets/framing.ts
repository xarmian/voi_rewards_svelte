export function quoteAsOfLabel(asOf: string | null | undefined): string {
	if (!asOf) return 'Quote time unavailable';
	const date = new Date(asOf);
	if (!Number.isFinite(date.getTime())) return 'Quote time unavailable';
	return `Data as of ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
