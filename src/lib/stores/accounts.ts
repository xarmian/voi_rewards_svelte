import { writable, get } from 'svelte/store';
import { config } from '$lib/config';
import algosdk from 'algosdk';
import { algodClient } from '$lib/utils/algod';
import { getNFD } from '$lib/utils/nfd';

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

  async function fetchData() {
    try {
      const response = await fetch(`${config.proposalApiBaseUrl}?action=online-stake-history`);
      const data = await response.json();
      update(() => ({
        data,
        lastFetched: Date.now()
      }));
      return data;
    } catch (error) {
      console.error('Error fetching online stake history:', error);
      return [];
    }
  }

  async function getData() {
    let currentValue: OnlineStakeStore | undefined;
    subscribe(store => {
      currentValue = store;
    })();

    if (!currentValue?.lastFetched || Date.now() - currentValue.lastFetched > CACHE_DURATION) {
      return await fetchData();
    }

    return currentValue.data;
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

// Consensus Info fetching with cache
export async function getConsensusInfo(address: string): Promise<ConsensusDetails | undefined> {
    if (!address) return;
    
    const info = get(consensusInfo);
    
    if (info[address]) return info[address];
    
    try {
        const url = `${config.proposalApiBaseUrl}?action=walletDetails&wallet=${address}`;
        const response = await fetch(url, { cache: 'no-store' });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch consensus info: ${response.statusText}`);
        }
        
        const data: ConsensusDetails = await response.json();
        
        consensusInfo.update(current => ({
            ...current,
            [address]: data
        }));
        
        return data;
    } catch (error) {
        console.error('Error fetching consensus info:', error);
        return undefined;
    }
}

// Account Information fetching with cache
export async function getAccountInfo(address: string): Promise<algosdk.modelsv2.Account | undefined> {
    if (!address) return;

    const info = get(accountInfo);

    if (info[address]) return info[address];

    try {
        const data = await algodClient.accountInformation(address).do() as algosdk.modelsv2.Account;
        
        accountInfo.update(current => ({
            ...current,
            [address]: data
        }));

        return data;
    } catch (error) {
        console.error('Error fetching account info:', error);
        return undefined;
    }
}

// Supply information fetching with cache
export async function getSupplyInfo(): Promise<SupplyInfo | null> {
    const currentSupply = get(supply);
    
    if (currentSupply) return currentSupply;

    try {
        const data = await algodClient.supply().do() as SupplyInfo;
        const ballastBalance = await fetch(`${config.proposalApiBaseUrl}?action=blacklist-balance`)
        .then(res => res.json())
        .then(data => data['blacklist_balance_total']);

        supply.set({...data, 'blacklisted-money': ballastBalance});

        return {...data, 'blacklisted-money': ballastBalance};
    } catch (error) {
        console.error('Error fetching supply info:', error);
        return null;
    }
}

export async function getNFDomains(addresses: string[]): Promise<Record<string, NFDomainResponse | null>> {
    if (!addresses.length) return {};

    const domains = get(nfDomains);
    const uncachedAddresses: string[] = [];
    const results: Record<string, NFDomainResponse | null> = {};

    addresses.forEach(address => {
        if (address in domains) {
            results[address] = domains[address];
        } else {
            uncachedAddresses.push(address);
        }
    });

    if (uncachedAddresses.length > 0) {
        const addressChunks = [];
        const chunkSize = 10;
        for (let i = 0; i < uncachedAddresses.length; i += chunkSize) {
            addressChunks.push(uncachedAddresses.slice(i, i + chunkSize));
        }

        // Process all chunks concurrently
        const chunkPromises = addressChunks.map(async (chunk) => {
            const newDomains = await getEnvoi(chunk);
            if (!newDomains.results) return;

            newDomains.results.forEach((result: { address: string, name: string }) => {
                if (result.address && result.name && result.name.length > 0) {
                    results[result.address] = {
                        name: result.name || result.address,
                        properties: {
                            address: result.address,
                            caAlgo: result.address,
                            verified: true
                        }
                    };
                } else {
                    results[result.address] = null;
                }
            });
        });

        // Wait for all chunks to complete
        await Promise.all(chunkPromises);
    }

    return results;
}

async function getEnvoi(addresses: string[]): Promise<{ results: { address: string, name: string }[] }> {
    const url = `https://api.envoi.sh/api/name/${addresses.join(',')}`;
    const response = await fetch(url);
    const data = await response.json();
    return data;
}

// NFDomains fetching with cache - now supports batch operations
export async function getNFDomainsx(addresses: string[]): Promise<Record<string, NFDomainResponse | null>> {
    if (!addresses.length) return {};
    
    const domains = get(nfDomains);
    const uncachedAddresses: string[] = [];
    const results: Record<string, NFDomainResponse | null> = {};

    // First check cache for each address
    addresses.forEach(address => {
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
                nfDomains.update(current => ({
                    ...current,
                    [result.key]: domainData
                }));
            });

            // Cache null results for addresses that didn't return a domain
            uncachedAddresses.forEach(address => {
                if (!(address in results)) {
                    results[address] = null;
                    nfDomains.update(current => ({
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
    consensusInfo.set({});
    accountInfo.set({});
    supply.set(null);
    nfDomains.set({});
}

