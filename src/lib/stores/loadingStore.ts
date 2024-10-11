import { writable } from 'svelte/store';

export const isLoading = writable(false);

export function startLoading() {
    isLoading.set(true);
}

export function stopLoading() {
    isLoading.set(false);
}