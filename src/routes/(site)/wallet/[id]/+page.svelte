<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
    import WalletView from '../../../../views/WalletView.svelte';

    export let data: PageData;
    let walletId = data.walletId;
</script>

<div class="bg-gray-100 dark:bg-gray-800 min-h-screen py-8">
    <div class="max-w-4xl mx-auto px-4">
        <button
            on:click={() => goto('/')}
            class="mb-6 text-blue-500 hover:text-blue-700 transition-colors duration-200 flex items-center"
        >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Back to Home
        </button>

        <WalletView isModal={false} {walletId} />
    </div>
</div>