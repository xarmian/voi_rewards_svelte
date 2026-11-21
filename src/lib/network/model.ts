import { writable } from 'svelte/store';
import { config } from '$lib/config';
import {
	priceSeries,
	stakeSeries,
	transactionSeries,
	type Resource,
	type DailyRow,
	type TransactionRow,
	type Period
} from './series';

type ResourceKey = 'stake' | 'price' | 'transactions';
type NetworkState = {
	stake: Resource<DailyRow> | null;
	price: Resource<DailyRow> | null;
	transactions: Resource<TransactionRow> | null;
	busy: Record<ResourceKey, boolean>;
	period: Period;
};

export function createNetwork(deps: { fetch?: typeof globalThis.fetch; now?: () => number } = {}) {
	const fetch = deps.fetch ?? globalThis.fetch;
	const now = deps.now ?? Date.now;
	let state: NetworkState = {
		stake: null,
		price: null,
		transactions: null,
		busy: { stake: true, price: true, transactions: true },
		period: 'day'
	};
	const { subscribe, set } = writable(state);
	const requests: Record<ResourceKey, number> = { stake: 0, price: 0, transactions: 0 };
	const txCache: Partial<Record<Period, Resource<TransactionRow>>> = {};
	function publish(change: Partial<NetworkState>) {
		state = { ...state, ...change };
		set(state);
	}
	async function retry(key: ResourceKey) {
		const request = ++requests[key];
		const period = state.period;
		publish({ busy: { ...state.busy, [key]: true } });
		const url = {
			stake: `${config.proposalApiBaseUrl}?action=online-stake-history`,
			price: '/api/price-history?period=7d',
			transactions: `/api/mimir?action=get_tx_counts&p_period=${period}&p_n=${period === 'day' ? 30 : 15}`
		}[key];
		let input: unknown = null;
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
			if (response.ok) input = await response.json();
		} catch {
			input = null;
		}
		if (request !== requests[key]) return;
		const receivedAt = now();
		switch (key) {
			case 'stake':
				publish({ stake: stakeSeries(input, state.stake ?? undefined, receivedAt) });
				break;
			case 'price':
				publish({ price: priceSeries(input, state.price ?? undefined, receivedAt) });
				break;
			case 'transactions': {
				const transactions = transactionSeries(input, txCache[period], receivedAt, period);
				txCache[period] = transactions;
				publish({ transactions });
				break;
			}
		}
		publish({ busy: { ...state.busy, [key]: false } });
	}
	async function setPeriod(period: Period) {
		if (state.period === period) return;
		publish({ period, transactions: txCache[period] ?? null });
		await retry('transactions');
	}
	return {
		subscribe,
		retry,
		setPeriod,
		load: () => Promise.all((['stake', 'price', 'transactions'] as const).map(retry))
	};
}
