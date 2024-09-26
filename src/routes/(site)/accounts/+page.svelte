<script lang="ts">
    //import { supabasePublicClient as supabase } from '$lib/supabase';
    import { Web3Wallet, setOnAuthHandler, connectedWallets } from 'avm-wallet-svelte';
    import type { User } from '@supabase/supabase-js';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import type { PageData } from '../$types';
	import InfoButton from '$lib/component/ui/InfoButton.svelte';
	import { onMount } from 'svelte';
    import { RadioButton, ButtonGroup } from 'flowbite-svelte';
    import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';

    interface DiscordAccount {
      id: string;
      username: string;
    }

    interface VoiWallet {
      address: string;
      is_primary: boolean;
    }

    export let data: PageData;
    let showPrivacyModal = false;

    $: discordAccounts = [] as DiscordAccount[];
    $: voiWallets = [] as VoiWallet[];
    let user: User | null = data.server_data.user;
    let isOptedIn = data.server_data.optinGroup;

    const supabase = data.supabase;

    onMount(() => {
        if (user) {
            discordAccounts.push({
                id: user.id,
                username: user.email??''
            });
            discordAccounts = discordAccounts;
        }

        voiWallets = data.server_data.wallets.map((wallet) => {
            return {
                address: wallet.address,
                is_primary: wallet.is_primary
            };
        });
        voiWallets.sort((a, b) => a.address.localeCompare(b.address));
    });

    function disconnectDiscord(accountId: string) {
      console.log(`Disconnecting Discord account ${accountId}...`);
      discordAccounts = discordAccounts.filter(account => account.id !== accountId);
      voiWallets = [];

      data.supabase.auth.signOut();
    }

    async function connectDiscord() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                redirectTo: `${window.location.origin}/accounts/auth`,
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
            const err = await response.text();
			console.error('Error: ', err);

            const resp = JSON.parse(err);
            alert(`ERROR: ${resp.error}`);
		}
		else {
            const data = await response.json();
            console.log('Wallet data sent to backend', data);

            const is_primary = (voiWallets.length == 0);

            if (!voiWallets.some(w => w.address === wallet.address)) {
                voiWallets = [...voiWallets, { address: wallet.address, is_primary: is_primary }];
                voiWallets.sort((a, b) => a.address.localeCompare(b.address));
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

    async function disconnectVoi(walletAddress: string) {
        console.log(`Disconnecting Voi wallet ${walletAddress}...`);
        voiWallets = voiWallets.filter(wallet => wallet.address !== walletAddress);

        // TODO: Send wallet disconnection request to backend?
        const formData = new FormData();
        formData.append('wallet', walletAddress);

        const response = await fetch('?/disconnectWallet', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error.message);
            return false;
        }
        else {
            // remove wallet from connectedWallets
            connectedWallets.update((wallets) => {
                return wallets.filter((wallet) => wallet.address !== walletAddress);
            });

            return true;
        }
    }

    async function handleOptInOut(value: boolean) {
        console.log('Opt in/out value:', value);
        const formData = new FormData();
        formData.append('optin', value.toString());

        const response = await fetch('?/optin', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error.message);
            return false;
        }
        else {
            return true;
        }
    }
</script>  

<div class="bg-gray-100 dark:bg-black">
    <div class="container mx-auto p-4 max-w-3xl">
        <h1 class="text-3xl font-bold mb-6 text-black dark:text-white">Account Management</h1>
        <div class="bg-white rounded-lg shadow-md p-6 mb-6 dark:bg-gray-800">
            Use of this site requires connecting a Discord account and one or more Voi wallets. The Discord account is used to verify your identity and Voi wallets are used to calculate and receive rewards.
            View the <button on:click={() => showPrivacyModal = true} class="text-blue-500">Privacy Policy</button> for more information.
        </div>

        <a href="https://discord.com/channels/1055863853633785857/1278379464019152998"
            target="_blank"
            class="flex flex-col text-center space-y-1 text-white bg-blue-500 hover:bg-blue-600 dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg shadow-md p-3 mb-6 transition-colors">
            <div class="text-xl font-semibold">
                Get the most from your Phase 2 Airdrop
            </div>
            <div class="text-sm">
                After connecting your Discord account
            </div>
            <div class="flex text-2xl underline self-center items-center">
                Complete Human Verification!
                <InfoButton noAbsolute={true}>
                    <div class="text-xs">
                        While Human verification is not required to receive the Phase 2 Airdrop, doing so will provide a boost to your rewards.
                    </div>
                </InfoButton>
            </div>
        </a>
        
        <div class="bg-white rounded-lg shadow-md p-6 mb-6 dark:bg-gray-800">
            <h2 class="text-2xl font-semibold mb-4">Discord Account</h2>
            <div class="text-gray-600 dark:text-gray-400 mb-4">
                Connect one Discord Account. All Voi addresses will be linked under this account.
            </div>
            {#if discordAccounts.length > 0}
                <ul class="space-y-2">
                    {#each discordAccounts as account (account.id)}
                    <li class="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded">
                        <span>{account.username}</span>
                        <button
                        on:click={() => disconnectDiscord(account.id)}
                        class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
                        >
                        Logout
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
            <div class="text-sm">
                NOTE: Your Discord account E-Mail address must be verified with Discord for this connection to work.
            </div>
            {/if}
            {#if discordAccounts.length > 0}
                <div class="m-4 flex items-center justify-center">
                    <label class="flex items-center space-x-2 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={isOptedIn}
                            on:change={() => handleOptInOut(isOptedIn)}
                            class="form-checkbox h-5 w-5 text-blue-600"
                        />
                        <span class="text-gray-700 dark:text-gray-300">Opt in to receive Voi Notification E-mails</span>
                    </label>
                </div>
                {#if !isOptedIn}
                    <div class="text-red-500 text-center">You are opted out of receiving Notification E-Mails.</div>
                {/if}
            {/if}
        </div>

        <div class="bg-white rounded-lg shadow-md p-6 dark:bg-gray-800 {discordAccounts.length === 0 ? 'opacity-50 pointer-events-none' : ''}">
            <h2 class="text-2xl font-semibold mb-4">Voi Accounts</h2>
            <div class="text-gray-600 dark:text-gray-400 mb-4">
                Connect your Voi addresses here. Your accounts will be aggregated, and any rewards will be sent to the wallet designated as Primary.
            </div>
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
                                            This wallet is set as your primary wallet. You can only have one primary wallet at a time. Your primary wallet will be used to receive rewards.
                                        </div>
                                    </InfoButton>
                                </span>
                            {:else}
                                <span class="hidden text-blue-500 cursor-pointer" on:click={() => setPrimary(wallet.address)}>
                                    <div>Set as Primary</div>
                                </span>
                            {/if}
                            <button
                            on:click={() => disconnectVoi(wallet.address)}
                            class="hidden bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
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
                <Web3Wallet availableWallets={['WalletConnect','Kibisis','LuteWallet']} connectButtonType="static" modalType="modal" showAuthButtons={true} algodClient={algodClient} indexerClient={algodIndexer} {wcProjectId} walletListClass="bg-gray-100 dark:bg-slate-600 dark:text-gray-200"/>
            </div>
            <!--<button
                on:click={connectVoi}
                class="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 dark:hover:bg-green-700 transition-colors"
                >
                Connect Voi Wallet
            </button>-->
        </div>
    </div>
</div>
{#if showPrivacyModal}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-md p-6 dark:bg-gray-800 max-w-3xl">
            <h2 class="text-2xl font-semibold mb-4">Privacy Policy</h2>
            <div class="overflow-auto" style="height: 75vh;">
                <p class="text-gray-600 dark:text-gray-400">
                    <div class="privacy-policy p-6 rounded-lg shadow-md">
                        <h1 class="text-2xl font-bold mb-4">Privacy Policy</h1>
                        <p class="text-sm text-gray-600 mb-6">Last updated: 2024-08-11</p>
                        
                        <h2 class="text-xl font-semibold mb-2">1. Introduction</h2>
                        <p class="mb-4">Welcome to Voirewards.com ("we," "our," or "us"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services, particularly in relation to connecting your Discord account and Voi wallet for participation in rewards distributions conducted by the Voi Foundation.</p>
                        <p class="mb-4">While Voirewards.com is not directly affiliated with the Voi Foundation, data submitted to this website may be collected and shared with the Voi Foundation for these stated purposes.</p>
                        <h2 class="text-xl font-semibold mb-2">2. Information We Collect</h2>
                        <p class="mb-2">We collect information that you provide directly to us when you use our website:</p>
                        <ul class="list-disc list-inside mb-4">
                            <li>Discord account information</li>
                            <li>Voi wallet information</li>
                            <li>Any other information you choose to provide</li>
                            <li>Hash of your IP address</li>
                        </ul>
                        
                        <h2 class="text-xl font-semibold mb-2">3. How We Use Your Information</h2>
                        <p class="mb-2">We use the information we collect to:</p>
                        <ul class="list-disc list-inside mb-4">
                            <li>Facilitate your participation in Voi Foundation rewards distribution</li>
                            <li>Determine eligibility for rewards</li>
                            <li>Communicate with you about the rewards and our services</li>
                            <li>Improve and optimize our website and services</li>
                        </ul>
                        
                        <h2 class="text-xl font-semibold mb-2">4. Sharing of Your Information</h2>
                        <p class="mb-2">We may share your information with:</p>
                        <ul class="list-disc list-inside mb-4">
                            <li>Voi Foundation: To facilitate rewards distribution and determine eligibility</li>
                            <li>Service Providers: Third-party vendors who help us operate our website and provide our services</li>
                            <li>Legal Requirements: When required by law or to protect our rights</li>
                        </ul>
                        
                        <h2 class="text-xl font-semibold mb-2">5. Data Storage and Security</h2>
                        <p class="mb-4">We use industry-standard security measures to protect your information.</p>
                        
                        <h2 class="text-xl font-semibold mb-2">6. Your Rights and Choices</h2>
                        <p class="mb-2">You have the right to:</p>
                        <ul class="list-disc list-inside mb-4">
                            <li>Access, correct, or delete your personal information</li>
                            <li>Opt-out of certain data collection or use</li>
                            <li>Withdraw consent for processing your data (where applicable)</li>
                        </ul>
                        <p class="mb-4">To exercise these rights, please contact us using the information provided in the "Contact Us" section.</p>
                        
                        <h2 class="text-xl font-semibold mb-2">7. Changes to This Privacy Policy</h2>
                        <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>
                    </div>
            </div>
            <button
            on:click={() => showPrivacyModal = false}
            class="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
        >
            Close
        </button>
</div>
    </div>
{/if}
<style lang="postcss">
    :global(body) {
        @apply bg-gray-100;
    }
</style>