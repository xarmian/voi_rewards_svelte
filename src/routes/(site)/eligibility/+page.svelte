<script lang="ts">
    import { supabasePublicClient as supabase } from '$lib/supabase';
    import { Web3Wallet, setOnAuthHandler, connectedWallets } from 'avm-wallet-svelte';
    import type { User } from '@supabase/supabase-js';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import type { PageData } from '../$types';
	import InfoButton from '$lib/component/ui/InfoButton.svelte';

    interface DiscordAccount {
      id: string;
      username: string;
    }

    interface VoiWallet {
      address: string;
      is_primary: boolean;
    }

    export let data: PageData;
    let discordAccounts: DiscordAccount[] = [];
    $: voiWallets = [] as VoiWallet[];
    let user: User | null = data.server_data.user;

    $: if (user) {
        discordAccounts.push({
            id: user.id,
            username: user.email??''
        });

        voiWallets = data.server_data.wallets.map((wallet) => {
            return {
                address: wallet.address,
                is_primary: wallet.is_primary
            };
        });
    }
  
    function disconnectDiscord(accountId: string) {
      // Implement Discord account disconnection logic
      console.log(`Disconnecting Discord account ${accountId}...`);
      discordAccounts = discordAccounts.filter(account => account.id !== accountId);
    }
  
    function disconnectVoi(walletAddress: string) {
      // Implement Voi wallet disconnection logic
      console.log(`Disconnecting Voi wallet ${walletAddress}...`);
      voiWallets = voiWallets.filter(wallet => wallet.address !== walletAddress);

      // TODO: Send wallet disconnection request to backend?

      // remove wallet from connectedWallets
      connectedWallets.update((wallets) => {
        return wallets.filter((wallet) => wallet.address !== walletAddress);
      });
    }
  
    async function connectDiscord() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                redirectTo: `${window.location.origin}/eligibility/auth`
            }
        });
        if (error) console.error('Error signing in with Discord:', error);
    }

	setOnAuthHandler(async (wallet) => {
		console.log('Wallet authenticated', wallet);

		const response = await fetch('/api/auth/wallet', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				action: 'auth_wallet',
				wallet: wallet,
			}),
		});

		if (!response.ok) {
			console.error('Failed to send wallet data to backend', await response.text());
		}
		else {
			const data = await response.json();
            console.log('Wallet data sent to backend', data);

            const is_primary = (voiWallets.length == 0);

            if (!voiWallets.some(w => w.address === wallet.address)) {
                voiWallets = [...voiWallets, { address: wallet.address, is_primary: is_primary }];
            }
		}
	});

    async function setPrimary(walletAddress: string) {
        // post to server to change primary wallet
        console.log(`Setting ${walletAddress} as primary wallet...`);

        const formData = new FormData();
        formData.append('wallet', walletAddress);

        const response = await fetch('?/setPrimaryWallet', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error.message);
            return false;
        } else {
            voiWallets = voiWallets.map(wallet => {
                if (wallet.address === walletAddress) {
                    wallet.is_primary = true;
                } else {
                    wallet.is_primary = false;
                }
                return wallet;
            });

            return true;
        }

    }
</script>  

<div class="container mx-auto p-4 max-w-3xl">
    <h1 class="text-3xl font-bold mb-6 text-white">Account Management</h1>

    <div class="bg-white rounded-lg shadow-md p-6 mb-6 dark:bg-gray-800">
        <h2 class="text-2xl font-semibold mb-4">Discord Account</h2>
        {#if discordAccounts.length > 0}
        <ul class="space-y-2">
            {#each discordAccounts as account (account.id)}
            <li class="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded">
                <span>{account.username}</span>
                <button
                on:click={() => disconnectDiscord(account.id)}
                class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
                >
                Disconnect
                </button>
            </li>
            {/each}
        </ul>
        {:else}
            <p class="text-gray-600 dark:text-gray-400">No Discord accounts connected.</p>
            <button
                on:click={connectDiscord}
                class="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
            >
            Connect Discord Account
        </button>
        {/if}
    </div>

    <div class="bg-white rounded-lg shadow-md p-6 dark:bg-gray-800 {discordAccounts.length === 0 ? 'opacity-50 pointer-events-none' : ''}">
        <h2 class="text-2xl font-semibold mb-4">Voi Accounts</h2>
        {#if voiWallets.length > 0}
            <ul class="space-y-2">
                {#each voiWallets as wallet (wallet.address)}
                    <li class="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded">
                        <span>{wallet.address.slice(0, 12)}...{wallet.address.slice(-12)}</span>
                        {#if wallet.is_primary}
                            <span class="flex">
                                <div class="text-green-500">Primary</div>
                                <InfoButton noAbsolute={true}>
                                    <div class="text-xs">
                                        Setting a wallet as primary will make it the wallet to be used for airdrops
                                    </div>
                                </InfoButton>
                            </span>
                        {:else}
                            <span class="text-blue-500 cursor-pointer flex" on:click={() => setPrimary(wallet.address)}>
                                <div>Set as Primary</div>
                            </span>
                        {/if}
                        <button
                        on:click={() => disconnectVoi(wallet.address)}
                        class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
                        >
                            Disconnect
                        </button>
                    </li>
                {/each}
            </ul>
        {:else}
            <p class="text-gray-600 dark:text-gray-400">No Voi accounts connected.</p>
        {/if}
        <div class="mt-4">
            <Web3Wallet availableWallets={['DeflyWallet','Kibisis','LuteWallet']} showAuthButtons={true} algodClient={algodClient} indexerClient={algodIndexer} walletListClass="bg-gray-100 dark:bg-slate-600 dark:text-gray-200"/>
        </div>
        <!--<button
            on:click={connectVoi}
            class="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 dark:hover:bg-green-700 transition-colors"
            >
            Connect Voi Wallet
        </button>-->
    </div>
</div>
<style lang="postcss">
    :global(body) {
        @apply bg-gray-100;
    }
</style>