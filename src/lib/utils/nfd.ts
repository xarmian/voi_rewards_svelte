export async function getAddressesForNFD(nfdName: string): Promise<string[]> {
    // Define the API endpoint
    const url = `https://api.nf.domains/nfd/${nfdName.toLocaleLowerCase()}?view=brief&poll=false&nocache=false`;

    try {
        // Make a GET request to the API
        const response = await fetch(url);

        if (!response.ok) {
            // If response is not OK, throw an error
            const errorData = await response.json();
            throw new Error(errorData.message || 'An error occurred while fetching data');
        }

        // Parse the JSON response
        const data = await response.json();

        // merge data.caAlgo and data.unverifiedCaAlgo arrays, but one or both may be undefined
        if (!data.caAlgo && !data.unverifiedCaAlgo) {
            return [];
        } else if (!data.caAlgo) {
            return data.unverifiedCaAlgo;
        } else if (!data.unverifiedCaAlgo) {
            return data.caAlgo;
        }
        else {
            return Array.from(new Set(data.caAlgo.concat(data.unverifiedCaAlgo)));        
        }
    } catch (error) {
        // Handle errors (e.g., NFD not found, API issues)
        console.error(`Error: ${(error as Error).message}`);
    }
    return [];
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
    const aggregatedNFDs: NFDomainResult[] = [];
    const addressChunks = [];
    const chunkSize = 20;

    for (let i = 0; i < addresses.length; i += chunkSize) {
        addressChunks.push(addresses.slice(i, i + chunkSize));
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
                Object.entries(additionalData).forEach((val) => {
                    const [key, value] = val;
                    const domainData = value as NFDomainApiResponse;
                    
                    if (domainData.name) {
                        aggregatedNFDs.push({
                            key,
                            replacementValue: domainData.name
                        });
                    }
                });
            })
            .catch(() => {
                // console.error("Error fetching nfd data:", error);
                return [];
            });
    });

    await Promise.all(allFetches);
    return aggregatedNFDs;
}

interface NFDSearchResult {
    appID: number;
    name: string;
    owner: string;
    depositAccount: string;
    properties: {
        verified?: {
            avatar?: string;
            avatarAsaId?: number;
        };
        userDefined?: {
            avatar?: string;
        };
    };
    state: string;
}

interface NFDSearchResponse {
    nfds: NFDSearchResult[];
    total: number;
}

export async function searchNFDomains(query: string): Promise<NFDSearchResult[]> {
    if (!query || query.length < 1) {
        return [];
    }

    const url = new URL('https://api.nf.domains/nfd/v2/search');
    const params = new URLSearchParams({
        prefix: query,
        view: 'thumbnail',
        limit: '10',
        sort: 'nameAsc'
    });

    try {
        const response = await fetch(`${url}?${params}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch NFD search results');
        }

        const data: NFDSearchResponse = await response.json();
        return data.nfds;
    } catch (error) {
        console.error('Error searching NFDomains:', error);
        return [];
    }
}