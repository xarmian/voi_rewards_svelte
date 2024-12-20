import { writable, get } from "svelte/store";

interface NFDCache {
    [key: string]: {
        addresses: string[];
        timestamp: number;
    };
}

interface AddressCache {
    [address: string]: {
        name: string;
        timestamp: number;
    };
}

// Cache expiration time (24 hours in milliseconds)
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

export const nfdData = writable<{
    nfdCache: NFDCache;
    addressCache: AddressCache;
}>({
    nfdCache: {},
    addressCache: {}
});

export async function getAddressesForNFD(nfdName: string): Promise<string[]> {
    const store = get(nfdData);
    const normalizedName = nfdName.toLowerCase();
    const now = Date.now();

    // Check cache first
    if (store.nfdCache[normalizedName] && 
        (now - store.nfdCache[normalizedName].timestamp) < CACHE_EXPIRATION) {
        return store.nfdCache[normalizedName].addresses;
    }

    // Define the API endpoint
    const url = `https://api.nf.domains/nfd/${normalizedName}?view=brief&poll=false&nocache=false`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'An error occurred while fetching data');
        }

        const data = await response.json();
        let addresses: string[] = [];

        if (data.caAlgo || data.unverifiedCaAlgo) {
            addresses = Array.from(new Set([
                ...(data.caAlgo || []),
                ...(data.unverifiedCaAlgo || [])
            ]));

            // Update cache
            nfdData.update(store => ({
                ...store,
                nfdCache: {
                    ...store.nfdCache,
                    [normalizedName]: {
                        addresses,
                        timestamp: now
                    }
                }
            }));
        }

        return addresses;
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        return [];
    }
}

interface NFDomainResult {
    key: string;
    replacementValue: string;
}

interface NFDomainApiResponse {
    name: string;
    [key: string]: unknown;
}

export async function getNFD(addresses: string[]): Promise<NFDomainResult[]> {
    const store = get(nfdData);
    const now = Date.now();
    const aggregatedNFDs: NFDomainResult[] = [];
    const addressesToFetch: string[] = [];

    // Check cache first
    addresses.forEach(address => {
        const cachedData = store.addressCache[address];
        if (cachedData && (now - cachedData.timestamp) < CACHE_EXPIRATION) {
            aggregatedNFDs.push({
                key: address,
                replacementValue: cachedData.name
            });
        } else {
            addressesToFetch.push(address);
        }
    });

    if (addressesToFetch.length === 0) {
        return aggregatedNFDs;
    }

    const addressChunks = [];
    const chunkSize = 20;

    for (let i = 0; i < addressesToFetch.length; i += chunkSize) {
        addressChunks.push(addressesToFetch.slice(i, i + chunkSize));
    }

    const allFetches = addressChunks.map((addressChunk) => {
        let url = "https://api.nf.domains/nfd/lookup?";
        const params = new URLSearchParams();

        addressChunk.forEach((address: string) => {
            params.append("address", address);
        });

        params.append("view", "tiny");
        params.append("allowUnverified", "true");

        url += params.toString();

        return fetch(url)
            .then(response => response.json())
            .then(additionalData => {
                const newCacheEntries: AddressCache = {};

                Object.entries(additionalData).forEach((val) => {
                    const [key, value] = val;
                    const domainData = value as NFDomainApiResponse;
                    
                    if (domainData.name) {
                        aggregatedNFDs.push({
                            key,
                            replacementValue: domainData.name
                        });

                        // Prepare cache entry
                        newCacheEntries[key] = {
                            name: domainData.name,
                            timestamp: now
                        };
                    }
                });

                // Update cache with new entries
                if (Object.keys(newCacheEntries).length > 0) {
                    nfdData.update(store => ({
                        ...store,
                        addressCache: {
                            ...store.addressCache,
                            ...newCacheEntries
                        }
                    }));
                }
            })
            .catch(() => {
                return [];
            });
    });

    await Promise.all(allFetches);
    return aggregatedNFDs;
}
