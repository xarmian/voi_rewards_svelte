import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createFavoritesStore() {
    // Initialize from localStorage if available
    const initialFavorites = browser ? 
        JSON.parse(localStorage.getItem('favoriteWallets') || '[]') : 
        [];
    
    const { subscribe, set, update } = writable<string[]>(initialFavorites);

    return {
        subscribe,
        toggle: (walletId: string) => update(favorites => {
            const newFavorites = favorites.includes(walletId) 
                ? favorites.filter(id => id !== walletId)
                : [...favorites, walletId];
            
            if (browser) {
                localStorage.setItem('favoriteWallets', JSON.stringify(newFavorites));
            }
            return newFavorites;
        }),
        reset: () => {
            set([]);
            if (browser) {
                localStorage.removeItem('favoriteWallets');
            }
        }
    };
}

export const favorites = createFavoritesStore(); 