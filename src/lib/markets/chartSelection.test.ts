import { expect, it, vi } from 'vitest';
import {
	resetChartSelection,
	pickMarket,
	selectionForToken,
	visibleChart,
	applyChartResult,
	refreshChart,
	pairQuoteLabel,
	applyPairResult,
	createRequestGate,
	convertsPairToUsd
} from './chartSelection';

const candles = [{ time: 1, open: 1, high: 3, low: 1, close: 2, volume: 4 }];
const pairCandles = [{ ...candles[0], close: 3 }];
const market = {
	trading_pair_id: 22,
	pair: 'ABC/USDC',
	exchange: 'Example',
	base_token_id: 1,
	quote_token_id: 2
};
const token = { data: candles, volumes: [], loading: false, error: '', show: true };
const picked = () => pickMarket(resetChartSelection(7), market);
const ready = () => ({
	...picked(),
	...applyChartResult(picked(), { data: pairCandles, volumes: [], error: '' })
});

it('shows the picked pair candles and names the pressed source while OHLCV is showing', () => {
	const view = visibleChart(ready(), token);
	expect(view.data).toEqual(pairCandles);
	expect(view.title).toContain(market.pair);
	expect(view.selectedTradingPairId).toBe(market.trading_pair_id);
	expect(view.selectedMarket).toEqual(market);
	expect(view.show).toBe(true);
});
it('Back restores the token candles and clears the pressed row', () => {
	const back = resetChartSelection(ready().tokenId);
	const view = visibleChart(back, token);
	expect(view.data).toEqual(candles);
	expect(view.selectedTradingPairId).toBeNull();
	expect(view.selectedMarket).toBeNull();
	expect(view.title).toBe('Market chart');
});
it('a second row immediately replaces the previous pair and its candles', () => {
	const second = { ...market, trading_pair_id: 33, pair: 'ABC/OTHER' };
	const state = pickMarket(ready(), second);
	const view = visibleChart(state, token);
	expect(view.selectedTradingPairId).toBe(33);
	expect(view.title).toContain('ABC/OTHER');
	expect(view.data).toEqual([]);
	expect(view.loading).toBe(true);
});
it('a token change clears the pair and does not clear a selection for the same token', () => {
	expect(selectionForToken(ready(), 7)).toEqual(ready());
	const view = visibleChart(selectionForToken(ready(), 8), token);
	expect(view.selectedTradingPairId).toBeNull();
	expect(view.data).toEqual(candles);
});
it.each([
	[{ error: 'Failed to load market OHLCV (503)' }, 'Failed to load market OHLCV (503)'],
	[{ data: [], volumes: [], error: '' }, 'No chart data available.']
])('keeps an unsuccessful pair selection in place and allows Back: %j', (result, message) => {
	const state = { ...picked(), ...applyChartResult(picked(), result) };
	const view = visibleChart(state, token);
	expect(view.error).toBe(message);
	expect(view.show).toBe(true);
	expect(view.data).toEqual([]);
	expect(view.selectedTradingPairId).toBe(22);
	expect(visibleChart(resetChartSelection(state.tokenId), token).data).toEqual(candles);
});
it('Refresh routes to the selected pair or the selected token with the supplied resolution', async () => {
	const handlers = { pair: vi.fn(), voi: vi.fn(), token: vi.fn() };
	await refreshChart(ready(), 7, '4h', 'USD', handlers);
	expect(handlers.pair).toHaveBeenCalledWith(market, '4h');
	expect(handlers.token).not.toHaveBeenCalled();
	expect(handlers.voi).not.toHaveBeenCalled();
	await refreshChart(resetChartSelection(7), 7, '1h', 'VOI', handlers);
	expect(handlers.token).toHaveBeenCalledWith(7, '1h', 'VOI');
	await refreshChart(resetChartSelection(0), 0, '1d', 'USD', handlers);
	expect(handlers.voi).toHaveBeenCalledWith('1d', 'USD');
});
it('a failed refetch keeps the last good pair or token candles and reports the error', () => {
	for (const previous of [ready(), token]) {
		const next = applyChartResult(previous, { error: 'Offline' });
		expect(next.data).toEqual(previous.data);
		expect(next.volumes).toEqual(previous.volumes);
		expect(next.error).toBe('Offline');
		expect(next.show).toBe(true);
	}
	expect(applyChartResult({ ...token, data: [], show: false }, { error: 'Offline' }).show).toBe(
		false
	);
});

it('labels a converted VOI-quoted pair as USD and every other pair with its own quote', () => {
	expect(pairQuoteLabel('ABC/VOI', true)).toBe('USD');
	expect(pairQuoteLabel('ABC/WVOI', true)).toBe('USD');
	expect(pairQuoteLabel('ABC/VOI', false)).toBe('VOI');
	expect(pairQuoteLabel('ABC/USDC', true)).toBe('USDC');
	expect(pairQuoteLabel('ABC', false)).toBe('');
});
it('keeps the pair quote on the visible chart and clears it with the pair', () => {
	const shown = { ...ready(), quote: 'USD' };
	expect(visibleChart(shown, token).selectedQuote).toBe('USD');
	expect(visibleChart(resetChartSelection(7), token).selectedQuote).toBeNull();
	expect(resetChartSelection(7).quote).toBeNull();
});
it('treats only the newest request as current', () => {
	const gate = createRequestGate();
	const first = gate.begin();
	const second = gate.begin();
	expect(gate.isCurrent(first)).toBe(false);
	expect(gate.isCurrent(second)).toBe(true);
	gate.invalidate();
	expect(gate.isCurrent(second)).toBe(false);
});

it('converts a pair to USD only when USD is selected and the pair is VOI-quoted', () => {
	expect(convertsPairToUsd('ABC/VOI', 'USD')).toBe(true);
	expect(convertsPairToUsd('ABC/WVOI', 'USD')).toBe(true);
	expect(convertsPairToUsd('ABC/VOI', 'VOI')).toBe(false);
	expect(convertsPairToUsd('ABC/USDC', 'USD')).toBe(false);
	expect(convertsPairToUsd('ABC', 'USD')).toBe(false);
});

it('relabels the pair quote only when new candles replace the old ones', () => {
	const shown = { ...pickMarket(resetChartSelection(7), market), ...ready(), quote: 'USD' };
	const empty = applyPairResult(shown, [], false);
	expect(empty.data).toEqual(shown.data);
	expect(empty.quote).toBe('USD');
	const fresh = applyPairResult(shown, pairCandles, false);
	expect(fresh.data).toEqual(pairCandles);
	expect(fresh.quote).toBe('USDC');
});
