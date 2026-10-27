export function readEpoch(url: URL, min: number, max: number): number {
	const raw = url.searchParams.get('epoch');
	if (raw === null || !/^\d+$/.test(raw)) return max;
	const epoch = Number(raw);
	return Number.isSafeInteger(epoch) && epoch >= min && epoch <= max ? epoch : max;
}

export function epochUrl(url: URL, epoch: number, max: number): URL {
	const next = new URL(url);
	if (epoch === max) next.searchParams.delete('epoch');
	else next.searchParams.set('epoch', String(epoch));
	return next;
}
