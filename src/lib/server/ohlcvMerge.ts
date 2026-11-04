import type { OHLCVData, PriceCandle } from '$lib/types/ohlcv.types';

// TASK-142: equivalent token ids (VOI 0/390001, aUSDC 302190/395614) can each carry a row for one
// bucket. One bucket time yields one candle: high is the max of the highs, low the min of the lows,
// volume the sum of the quote volumes, and open/close come from the row with the largest quote
// volume (the rows carry no trade order). A volume tie goes to the lower base, then quote, token id,
// so the result does not depend on row order. Output is ascending by time.
export function mergeCandleRows(rows: PriceCandle[]): OHLCVData[] {
	const buckets = new Map<number, PriceCandle[]>();
	for (const row of rows) {
		const time = Math.floor(new Date(row.bucket_start).getTime() / 1000);
		const group = buckets.get(time);
		if (group) group.push(row);
		else buckets.set(time, [row]);
	}

	const candles: OHLCVData[] = [];
	for (const [time, group] of buckets) {
		let lead = group[0];
		let high = Number(group[0].high);
		let low = Number(group[0].low);
		let volume = 0;
		for (const row of group) {
			high = Math.max(high, Number(row.high));
			low = Math.min(low, Number(row.low));
			volume += Number(row.volume_quote);
			if (outranks(row, lead)) lead = row;
		}
		candles.push({
			time,
			open: Number(lead.open),
			high,
			low,
			close: Number(lead.close),
			volume
		});
	}
	return candles.sort((a, b) => a.time - b.time);
}

function outranks(row: PriceCandle, lead: PriceCandle): boolean {
	const diff = Number(row.volume_quote) - Number(lead.volume_quote);
	if (diff !== 0) return diff > 0;
	if (row.base_token_id !== lead.base_token_id) return row.base_token_id < lead.base_token_id;
	return row.quote_token_id < lead.quote_token_id;
}
