<script lang="ts">
    import { Web3Wallet, selectedWallet } from 'avm-wallet-svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';
    import AccountInfo from '$lib/components/wallet/AccountInfo.svelte';
    import TotalAccountsInfo from '$lib/components/wallet/TotalAccountsInfo.svelte';
    import { config } from '$lib/config';
    import type { LockContract } from '$lib/data/types';
	  import { goto } from '$app/navigation';
	  import { onDestroy, onMount } from 'svelte';
    import NodeComponent from '$lib/component/NodeComponent.svelte';
    import ProposalsComponent from '$lib/component/ProposalsComponent.svelte';
    import { getAccountInfo, getSupplyInfo, getConsensusInfo } from '$lib/stores/accounts';
    import { dataTable } from '../../../../stores/dataTable';
    import { extrapolateRewardPerBlock, getTokensByEpoch } from '$lib/utils';
    import { calculateRewards } from '$lib/utils/rewards';

    export let data: {
        walletId: string;
        parentWalletId: string | null;
    };

    let activeSection = 'consensus';
    let supply: any;
    let apiData: any;
    $: walletId = data.walletId;
    $: parentWalletId = data.parentWalletId;
    let loading = true;

    onMount(() => {
        loading = false;
        if (data.walletId && data.walletId.length > 0 && data.walletId != $selectedWallet?.address) {
            selectedWallet.set({address: data.walletId, app: ''});
        }
    });

    const unsubSelectedWallet = selectedWallet.subscribe((wallet) => {
        if (!loading && wallet?.address && wallet.address.length > 0 && walletId !== wallet.address) {
            activeSection = 'consensus';
            goto(`/wallet/${wallet.address}`);
        }
    });

    onDestroy(() => {
        unsubSelectedWallet();
    });

    const sections = [
      { id: 'consensus', name: 'Consensus' },
      { id: 'staking', name: 'Staking' },
      { id: 'proposals', name: 'Proposals' },
      //{ id: 'security', name: 'Security Settings' },
      //{ id: 'preferences', name: 'Preferences' },
      //{ id: 'billing', name: 'Billing Information' }
    ];
    
    function setActiveSection(sectionId: string): void {
      activeSection = sectionId;
    }

    interface Account {
      address: string;
      isParticipating: boolean;
      balance: number;
      blocksProduced24h: number;
      expectedBlocksPerDay: number;
      expectedBlocksPerWeek: number;
      expectedBlocksPerMonth: number;
      estimatedRewardsPerDay: number;
      estimatedRewardsPerWeek: number;
      estimatedRewardsPerMonth: number;
    }

    let primaryAccountInfo: Account | null = null;
    let childAccounts: Account[] = [];

    function calculateAverageBlockTime(estimatedBlocks: number) {
        const epochBlocks = apiData.last_block - apiData.first_block;
        const epochSeconds = epochBlocks * 2.8; // Assuming 2.8 seconds per block
        return epochSeconds / estimatedBlocks;
    }

    function calculateExpectedBlocks(days: number, balance: number) {
        const secondsPerDay = 24 * 60 * 60;
        const blocksPerDay = secondsPerDay / 2.8; // Assuming 2.8 seconds per block
        return (balance / supply['online-money']) * blocksPerDay * days;
    }

    let isInitialized = false;

    const updateAccountInfo = async (address: string) => {
      primaryAccountInfo = null;
      childAccounts = [];

      try {
        const [supplyData, accountInfo, dates] = await Promise.all([
          getSupplyInfo(),
          getAccountInfo(address),
          dataTable.fetchDateRanges()
        ]);
        
        supply = supplyData;
        
        const latestEpoch = dates[dates.length - 1];
        const [epochData, tokens] = await Promise.all([
          dataTable.fetchData(latestEpoch.id),
          getTokensByEpoch(latestEpoch.epoch)
        ]);

        let voiPerBlock = 0;
        
        if (epochData) {
          const rewardedBlocks = epochData.num_blocks + Math.min(epochData.num_blocks / 3, epochData.num_blocks_ballast);
          const rewardData = extrapolateRewardPerBlock(rewardedBlocks, tokens);
          voiPerBlock = rewardData.projectedRewardPerBlock;
        }

        if (voiPerBlock === 0) {
          console.error('Warning: voiPerBlock calculation resulted in 0');
          return;
        }

        const balance = Number(accountInfo?.amount ?? 0);
        const onlineMoney = Number(supply?.['online-money'] ?? 0);
        
        const rewards = calculateRewards(balance, onlineMoney, voiPerBlock);

        primaryAccountInfo = {
          address: address,
          isParticipating: accountInfo?.status === 'Online',
          balance: balance / 1e6,
          blocksProduced24h: 0,
          ...rewards
        };

        const curl = `${config.lockvestApiBaseUrl}?owner=${address}`;
        const response = await fetch(curl, { cache: 'no-store' });
        const data = await response.json();

        await Promise.all(data.accounts.map(async (account: LockContract) => {
          const childAccountInfo = await getAccountInfo(account.contractAddress);
          const childBalance = Number(childAccountInfo?.amount ?? 0);
          const childRewards = calculateRewards(childBalance, onlineMoney, voiPerBlock);

          childAccounts = [...childAccounts, {
            address: account.contractAddress,
            isParticipating: childAccountInfo?.status === 'Online',
            balance: childBalance / 1e6,
            blocksProduced24h: 0,
            ...childRewards
          }];
        }));

        isInitialized = true;

      } catch (error) {
        console.error('Error updating account info:', error);
      }
    };

    $: {
      if (!isInitialized && (parentWalletId || (walletId && walletId.length > 0))) {
        updateAccountInfo(parentWalletId || walletId);
      }
    }

    let isMobileMenuOpen = false;

    function toggleMobileMenu() {
        isMobileMenuOpen = !isMobileMenuOpen;
    }
  </script>
  
  <div class="flex flex-col md:flex-row">
    <!-- Mobile Header -->
    <div class="md:hidden flex-shrink-0 flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800">
        <button
            class="text-gray-600 dark:text-gray-200"
            on:click={toggleMobileMenu}
            aria-label="Toggle menu"
        >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                    stroke-width="2" 
                    d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                />
            </svg>
        </button>
        <div class="flex-1 mx-4">
            <Web3Wallet
                availableWallets={['WalletConnect', 'Kibisis', 'LuteWallet', 'Biatec Wallet']}
                showAuthButtons={false}
                {algodClient}
                indexerClient={algodIndexer}
                wcProject={{
                    projectId: wcProjectId,
                    projectName: 'Voi Rewards Auditor',
                    projectDescription: 'Voi Rewards Auditor',
                    projectUrl: 'https://voirewards.com',
                    projectIcons: ['https://voirewards.com/android-chrome-192x192.png'],
                }}
                walletListClass="bg-gray-100 dark:bg-slate-600 dark:text-gray-200"
                allowWatchAccounts={true}
                showAuthenticated={false}
                modalType="dropdown"
            />
        </div>
    </div>

    <!-- Sidebar - Desktop & Mobile -->
    <aside class={`
        ${isMobileMenuOpen ? 'block' : 'hidden'} 
        md:block 
        w-full md:w-64 
        bg-gray-100 dark:bg-gray-800 
        p-5
        ${isMobileMenuOpen ? 'fixed inset-0 z-50' : ''}
        md:relative
        md:flex-shrink-0
        overflow-y-auto
    `}>
        <button
            class="md:hidden absolute top-20 right-4 text-gray-600 dark:text-gray-200"
            on:click={toggleMobileMenu}
            aria-label="Close menu"
        >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                    stroke-width="2" 
                    d="M6 18L18 6M6 6l12 12"
                />
            </svg>
        </button>

        <nav class="flex flex-col gap-4">
            <div class="h-20 md:h-0"></div>
            <a
                href="/"
                class="hidden md:inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow transition-colors duration-200"
            >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Dashboard
            </a>
            <ul class="space-y-2">
                {#each sections as section}
                    <li>
                        <button
                            class="w-full text-left py-2 px-4 rounded transition-colors duration-200 ease-in-out {activeSection === section.id ? 'bg-gray-200 dark:bg-gray-700 font-bold' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}"
                            on:click={() => {
                                setActiveSection(section.id);
                                if (window.innerWidth < 768) {
                                    toggleMobileMenu();
                                }
                            }}
                        >
                            {section.name}
                        </button>
                    </li>
                {/each}
            </ul>
        </nav>
    </aside>
    
    <main class="flex-1 bg-white dark:bg-gray-900">
        <!-- Desktop Wallet Connection -->
        <div class="sticky top-0 z-10 hidden md:flex w-full justify-end p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <Web3Wallet
                availableWallets={['WalletConnect', 'Kibisis', 'LuteWallet', 'Biatec Wallet']}
                showAuthButtons={false}
                {algodClient}
                indexerClient={algodIndexer}
                wcProject={{
                    projectId: wcProjectId,
                    projectName: 'Voi Rewards Auditor',
                    projectDescription: 'Voi Rewards Auditor',
                    projectUrl: 'https://voirewards.com',
                    projectIcons: ['https://voirewards.com/android-chrome-192x192.png'],
                }}
                walletListClass="bg-gray-100 dark:bg-slate-600 dark:text-gray-200"
                allowWatchAccounts={true}
                showAuthenticated={false}
                modalType="dropdown"
            />
        </div>

        <div class="p-4 md:p-5">
            {#if walletId}
                {#if activeSection === 'staking'}
                    <div class="space-y-4 md:space-y-6">
                        {#if primaryAccountInfo}
                            <h3 class="text-lg md:text-xl font-semibold mb-2">Primary Account</h3>
                            <div class="bg-gray-50 dark:bg-gray-800 p-3 md:p-4 rounded-lg shadow">
                                <AccountInfo account={primaryAccountInfo} addressLink={walletId != primaryAccountInfo.address} />
                            </div>
                        {:else}
                            <p class="text-gray-600">Loading...</p>
                        {/if}
                        
                        {#if childAccounts.length > 0}
                            <div class="space-y-3 md:space-y-4">
                                <h3 class="text-lg md:text-xl font-semibold">Staking Contracts</h3>
                                {#each childAccounts as childAccount}
                                    {#if childAccount.balance > 0.1}
                                        <div class="bg-gray-50 dark:bg-gray-800 p-3 md:p-4 rounded-lg shadow">
                                            <AccountInfo account={childAccount} addressLink={walletId != childAccount.address} />
                                        </div>
                                    {/if}
                                {/each}
                            </div>
                        {/if}
                    </div>
                {:else if activeSection === 'consensus'}
                    <h2 class="text-xl md:text-2xl font-bold mb-4">Consensus</h2>
                    <NodeComponent walletId={walletId} />
                {:else if activeSection === 'proposals'}
                    <h2 class="text-xl md:text-2xl font-bold mb-4">Proposals</h2>
                    <ProposalsComponent walletId={walletId} />
                {/if}
            {:else}
                <p class="text-gray-600">Please connect a wallet to view account information.</p>
            {/if}
        </div>
    </main>
  </div>
