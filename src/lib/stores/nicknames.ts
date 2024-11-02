import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createNicknameStore() {
    const STORAGE_KEY = 'wallet_nicknames';
    
    // Initialize from localStorage if available
    const initialNicknames = browser ? 
        JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') : 
        {};
    
    const { subscribe, set, update } = writable<Record<string, string>>(initialNicknames);

    return {
        subscribe,
        setNickname: (address: string, nickname: string) => {
            update(nicknames => {
                const updated = { ...nicknames, [address]: nickname };
                if (browser) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                }
                return updated;
            });
        },
        removeNickname: (address: string) => {
            update(nicknames => {
                const updated = { ...nicknames };
                delete updated[address];
                if (browser) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                }
                return updated;
            });
        },
        reset: () => {
            set({});
            if (browser) {
                localStorage.removeItem(STORAGE_KEY);
            }
        }
    };
}

export const nicknames = createNicknameStore(); 