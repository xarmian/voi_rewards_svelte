import { writable, get } from 'svelte/store';

interface ImageCache {
    failedUrls: Set<string>;
    cachedUrls: Map<string, string>; // Original URL -> Blob URL
}

const imageStore = writable<ImageCache>({
    failedUrls: new Set(),
    cachedUrls: new Map(),
});

export const imageCache = {
    subscribe: imageStore.subscribe,
    getCachedUrl: (url: string): string | undefined => {
        return get(imageStore).cachedUrls.get(url);
    },
    hasFailed: (url: string): boolean => {
        return get(imageStore).failedUrls.has(url);
    },
    markAsFailed: (url: string) => {
        imageStore.update(store => {
            return {
                ...store,
                failedUrls: new Set(store.failedUrls).add(url),
            };
        });
    },
    cacheImage: async (url: string): Promise<string> => {
        const existing = get(imageStore).cachedUrls.get(url);
        if (existing) return existing;
        
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            imageStore.update(store => {
                const newCache = new Map(store.cachedUrls);
                newCache.set(url, blobUrl);
                return {
                    ...store,
                    cachedUrls: newCache,
                };
            });
            
            return blobUrl;
        } catch (error) {
            imageCache.markAsFailed(url);
            throw error;
        }
    },
    clear: () => {
        imageStore.set({
            failedUrls: new Set(),
            cachedUrls: new Map(),
        });
    }
}; 