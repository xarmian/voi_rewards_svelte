import { writable, get } from 'svelte/store';
import { config } from '$lib/config';
import algosdk from 'algosdk';
import { algodClient } from '$lib/utils/algod';
import { getNFD } from '$lib/utils/nfd';
import { createKeyedCache } from '$lib/utils/asyncCache';

export interface ConsensusInfo {
	[key: string]: ConsensusDetails;
}

export interface ConsensusDetails {
	first_block: number;
	last_block: number;
	last_vote_block: number;
	last_vote_timestamp: string;
	total_blocks: number;
	vote_count: number;
}

export interface SupplyInfo {
	'current-round': number;
	'online-money': number;
	'total-money': number;
	'blacklisted-money': number;
}

export interface NFDomainResponse {
	name: string;
	properties: {
		address: string;
		caAlgo: string;
		verified: boolean;
	};
}

export type Account = algosdk.modelsv2.Account;

interface NFDomainResult {
	key: string;
	replacementValue: string;
}

interface OnlineStakeData {
	date: string;
	avg_online_stake: number;
	max_timestamp: string;
}

interface OnlineStakeStore {
	data: OnlineStakeData[];
	lastFetched: number | null;
}

function createOnlineStakeStore() {
	const { subscribe, update } = writable<OnlineStakeStore>({
		data: [],
		lastFetched: null
	});

	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

	async function fetchData(): Promise<OnlineStakeData[] | null> {
		try {
			const response = await fetch(`${config.proposalApiBaseUrl}?action=online-stake-history`);
			if (!response.ok) throw new Error(`Failed to fetch online stake history: HTTP ${response.status}`);
			const data = await response.json();
			if (!Array.isArray(data)) throw new Error('Invalid online stake history');
			update(() => ({
				data,
				lastFetched: Date.now()
			}));
			return data;
		} catch (error) {
			console.error('Error fetching online stake history:', error);
			return null;
		}
	}

	async function getData(): Promise<OnlineStakeData[] | null> {
		let currentValue: OnlineStakeStore | undefined;
		subscribe((store) => {
			currentValue = store;
		})();

		if (currentValue?.lastFetched && Array.isArray(currentValue.data) &&
			Date.now() - currentValue.lastFetched <= CACHE_DURATION) {
			return currentValue.data;
		}

		return await fetchData();
	}

	return {
		subscribe,
		getData,
		refresh: fetchData
	};
}

export const onlineStakeStore = createOnlineStakeStore();

// Stores
export const consensusInfo = writable<ConsensusInfo>({});
export const accountInfo = writable<Record<string, algosdk.modelsv2.Account>>({});
export const supply = writable<SupplyInfo | null>(null);
export const nfDomains = writable<Record<string, NFDomainResponse | null>>({});

export const ACCOUNT_CACHE_TTL = Object.freeze({
	account: 30_000,
	consensus: 30_000,
	supply: 5 * 60_000
});

const consensusCache = createKeyedCache<string, ConsensusDetails | undefined>({
	ttlMs: ACCOUNT_CACHE_TTL.consensus
});
const accountCache = createKeyedCache<string, Account | undefined>({ ttlMs: ACCOUNT_CACHE_TTL.account });
const supplyCache = createKeyedCache<string, SupplyInfo | null>({ ttlMs: ACCOUNT_CACHE_TTL.supply });
let cacheGeneration = 0;

// TASK-30: cache fresh values and share requests for the same address.
export async function getConsensusInfo(
	address: string,
	forceRefresh: boolean = false
): Promise<ConsensusDetails | undefined> {
	if (!address) return;
	const generation = cacheGeneration;
	return consensusCache.get(address, async () => {
		try {
			const url = `${config.proposalApiBaseUrl}?action=walletDetails&wallet=${address}`;
			const response = await fetch(url, { cache: 'no-store' });
			if (!response.ok) {
				throw new Error(`Failed to fetch consensus info: ${response.statusText}`);
			}
			const data: ConsensusDetails = await response.json();
			if (generation === cacheGeneration) {
				consensusInfo.update((current) => ({ ...current, [address]: data }));
			}
			return data;
		} catch (error) {
			console.error('Error fetching consensus info:', error);
			return undefined;
		}
	}, { force: forceRefresh });
}

export async function getAccountInfo(
	address: string,
	forceRefresh: boolean = false
): Promise<algosdk.modelsv2.Account | undefined> {
	if (!address) return;
	const generation = cacheGeneration;
	return accountCache.get(address, async () => {
		try {
			const data = (await algodClient.accountInformation(address).do()) as algosdk.modelsv2.Account;
			if (generation === cacheGeneration) {
				accountInfo.update((current) => ({ ...current, [address]: data }));
			}
			return data;
		} catch (error) {
			console.error('Error fetching account info:', error);
			return undefined;
		}
	}, { force: forceRefresh });
}

export async function getSupplyInfo(): Promise<SupplyInfo | null> {
	const generation = cacheGeneration;
	return supplyCache.get('supply', async () => {
		try {
			const data = (await algodClient.supply().do()) as SupplyInfo;
			const res = await fetch(`${config.proposalApiBaseUrl}?action=blacklist-balance`);
			if (!res.ok) throw new Error(`Failed to fetch blacklist balance: HTTP ${res.status}`);
			const blacklistData = await res.json();
			const ballastBalance = Number(blacklistData.blacklist_balance_total);
			if (!Number.isFinite(ballastBalance) || ballastBalance < 0) {
				throw new Error('Invalid blacklist balance');
			}
			const result = { ...data, 'blacklisted-money': ballastBalance };
			if (generation === cacheGeneration) supply.set(result);
			return result;
		} catch (error) {
			console.error('Error fetching supply info:', error);
			return null;
		}
	});
}

export async function getNFDomains(
	addresses: string[]
): Promise<Record<string, NFDomainResponse | null>> {
	if (!addresses.length) return {};

	const domains = get(nfDomains);
	const uncachedAddresses: string[] = [];
	const results: Record<string, NFDomainResponse | null> = {};

	addresses.forEach((address) => {
		if (address in domains) {
			results[address] = domains[address];
		} else {
			uncachedAddresses.push(address);
		}
	});

	if (uncachedAddresses.length > 0) {
		const addressChunks = [];
		const chunkSize = 50;
		for (let i = 0; i < uncachedAddresses.length; i += chunkSize) {
			addressChunks.push(uncachedAddresses.slice(i, i + chunkSize));
		}

		// Process all chunks concurrently
		const chunkPromises = addressChunks.map(async (chunk) => {
			const newDomains = await getEnvoi(chunk);
			if (!newDomains.results) return;

			newDomains.results.forEach((result: { address: string; name: string }) => {
				const domainData =
					result.address && result.name && result.name.length > 0
						? {
								name: result.name,
								properties: {
									address: result.address,
									caAlgo: result.address,
									verified: true
								}
							}
						: null;

				results[result.address] = domainData;

				// Update the nfDomains store for each new result
				nfDomains.update((current) => ({
					...current,
					[result.address]: domainData
				}));
			});

			// Cache null results for addresses that didn't return a domain
			chunk.forEach((address) => {
				if (!(address in results)) {
					results[address] = null;
					nfDomains.update((current) => ({
						...current,
						[address]: null
					}));
				}
			});
		});

		// Wait for all chunks to complete
		await Promise.all(chunkPromises);
	}

	return results;
}

async function getEnvoi(
	addresses: string[]
): Promise<{ results: { address: string; name: string }[] }> {
	const url = `https://api.envoi.sh/api/name/${addresses.join(',')}`;
	const response = await fetch(url);
	const data = await response.json();
	return data;
}

// NFDomains fetching with cache - now supports batch operations
export async function getNFDomainsx(
	addresses: string[]
): Promise<Record<string, NFDomainResponse | null>> {
	if (!addresses.length) return {};

	const domains = get(nfDomains);
	const uncachedAddresses: string[] = [];
	const results: Record<string, NFDomainResponse | null> = {};

	// First check cache for each address
	addresses.forEach((address) => {
		if (address in domains) {
			results[address] = domains[address];
		} else {
			uncachedAddresses.push(address);
		}
	});

	// If we have uncached addresses, fetch them
	if (uncachedAddresses.length > 0) {
		try {
			const newDomains = await getNFD(uncachedAddresses);

			// Process the results
			newDomains.forEach((result: NFDomainResult) => {
				const domainData: NFDomainResponse = {
					name: result.replacementValue,
					properties: {
						address: result.key,
						caAlgo: result.key,
						verified: true // You might want to adjust this based on actual data
					}
				};

				results[result.key] = domainData;

				// Update the cache
				nfDomains.update((current) => ({
					...current,
					[result.key]: domainData
				}));
			});

			// Cache null results for addresses that didn't return a domain
			uncachedAddresses.forEach((address) => {
				if (!(address in results)) {
					results[address] = null;
					nfDomains.update((current) => ({
						...current,
						[address]: null
					}));
				}
			});
		} catch (error) {
			console.error('Error fetching NFDomains:', error);
		}
	}

	console.log(results);

	return results;
}

// Keep the single address lookup for backwards compatibility
export async function getNFDomain(address: string): Promise<NFDomainResponse | null> {
	if (!address) return null;

	const result = await getNFDomains([address]);
	return result[address] || null;
}

// Optional: Function to clear caches
export function clearCaches() {
	cacheGeneration++;
	consensusCache.invalidate();
	accountCache.invalidate();
	supplyCache.invalidate();
	consensusInfo.set({});
	accountInfo.set({});
	supply.set(null);
	nfDomains.set({});
}
