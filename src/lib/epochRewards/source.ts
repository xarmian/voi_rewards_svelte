import { config } from '$lib/config';
import { dataTable } from './dataTable';
import { epochRange } from './calendar';
import type { EpochResponse } from './table';

/** Where epoch history comes from: the live proposers API today, a snapshot later. */
export interface EpochHistorySource {
	readonly kind: 'live' | 'snapshot';
	/** Payload `{ max_timestamp }`. */
	latestUrl(): string;
	/** Payload `{ epochs: [...] }`. */
	statsUrl(): string;
	/** Payload `EpochResponse`. */
	rowsUrl(epoch: number): string;
	/** Client-side, cached rows; `refresh` drops the cache first. */
	rows(epoch: number, opts?: { refresh?: boolean }): Promise<EpochResponse>;
}

const day = (date: Date) => date.toISOString().slice(0, 10);

export const liveEpochHistory: EpochHistorySource = {
	kind: 'live',
	latestUrl: () => config.proposalApiBaseUrl,
	statsUrl: () => '/api/epochs',
	rowsUrl(epoch) {
		const range = epochRange(epoch);
		return `${config.proposalApiBaseUrl}?start=${day(range.start)}&end=${day(range.end)}`;
	},
	rows(epoch, { refresh = false } = {}) {
		if (refresh) dataTable.clearCache();
		return dataTable.fetchData(epochRange(epoch).id);
	}
};

/** Payload `{ snapshots: [...] }`: one wallet's completed epochs, for the rewards tab. */
export function walletSummaryUrl(address: string): string {
	return `${config.proposalApiBaseUrl}?action=epoch-summary&wallet=${encodeURIComponent(address)}`;
}

/**
 * The source the home page reads. Module-internal on purpose: index.ts is in the layout
 * chunk and this pulls in the client rewards cache. A snapshot source swaps in here.
 */
export const epochHistory: EpochHistorySource = liveEpochHistory;
