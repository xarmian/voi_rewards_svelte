import { writable } from 'svelte/store';
import type { FungibleTokenType } from '$lib/types/assets';

export const fungibleTokens = writable<FungibleTokenType[]>([]); 