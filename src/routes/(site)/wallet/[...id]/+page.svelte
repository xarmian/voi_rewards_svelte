<script lang="ts">
    import { Web3Wallet, selectedWallet } from 'avm-wallet-svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';
    import AccountInfo from '$lib/components/wallet/AccountInfo.svelte';
    import { config } from '$lib/config';
    import type { LockContract } from '$lib/data/types';
	  import { goto } from '$app/navigation';
	  import { onDestroy, onMount } from 'svelte';
    import NodeComponent from '$lib/component/NodeComponent.svelte';
    import ProposalsComponent from '$lib/component/ProposalsComponent.svelte';
    import CalculatorComponent from '$lib/component/CalculatorComponent.svelte';
    import { getAccountInfo, getSupplyInfo } from '$lib/stores/accounts';
    import { dataTable } from '../../../../stores/dataTable';
    import { getTokensByEpoch } from '$lib/utils';
    import { browser } from '$app/environment';
    import { page } from '$app/stores';
    import EpochComponent from '$lib/component/EpochComponent.svelte';
    
    export let data: {
        walletId: string;
        parentWalletId: string | null;
        hash: string;
    };

    let activeSection = 'consensus';
    let supply: any;
    let apiData: any;
    $: walletId = data.walletId;
    $: parentWalletId = data.parentWalletId;
    let loading = true;

    const sections = [
      { id: 'consensus', name: 'Consensus' },
      //{ id: 'staking', name: 'Staking' },
      { id: 'proposals', name: 'Proposals' },
      { id: 'epochs', name: 'Epochs' },
      { id: 'calculator', name: 'Calculator' },
      //{ id: 'preferences', name: 'Preferences' },
      //{ id: 'billing', name: 'Billing Information' }
    ];
    
    $: {
        if (browser) {
          const hash = window.location.hash.slice(1);
          if (hash && sections.some(section => section.id === hash)) {
              activeSection = hash;
          }
        }
    }

    let isDropdownOpen = false;

    function toggleDropdown() {
      isDropdownOpen = !isDropdownOpen;
    }

    function handleClickOutside(event: MouseEvent) {
      const dropdown = document.getElementById('account-dropdown');
      if (dropdown && !dropdown.contains(event.target as Node)) {
        isDropdownOpen = false;
      }
      event.stopPropagation();
    }

    onMount(() => {
        loading = false;
        if (data.walletId && data.walletId.length > 0 && data.walletId != $selectedWallet?.address) {
            //selectedWallet.set({address: data.walletId, app: ''});
        }

        if (browser) {
            window.addEventListener('hashchange', handleHashChange);
            document.addEventListener('click', handleClickOutside);
        }
    });

    onDestroy(() => {
        unsubSelectedWallet();
        
        if (browser) {
            window.removeEventListener('hashchange', handleHashChange);
            document.removeEventListener('click', handleClickOutside);
        }
    });

    function handleHashChange() {
        if (!browser) return;
        const hash = window.location.hash.slice(1);
        if (hash && sections.some(section => section.id === hash)) {
            activeSection = hash;
        }
    }

    function setActiveSection(sectionId: string): void {
        activeSection = sectionId;
        if (browser) {
            history.pushState(null, '', `#${sectionId}`);
        }
    }

    const unsubSelectedWallet = selectedWallet.subscribe((wallet) => {
        if (!loading && wallet?.address && wallet.address != walletId) {
            if (parentWalletId != wallet.address) {
                goto(`/wallet/${wallet.address}`, { invalidateAll: true });
            }
        }
    });

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

        let rewardStake = 0;
        
        if (epochData) {
          // get community stake
          const communityStake = Number(supply['online-money']) - Number(epochData?.blacklist_balance_total);
          rewardStake = communityStake + Math.min(epochData?.blacklist_balance_total, communityStake / 3);
        }

        const balance = Number(accountInfo?.amount ?? 0);
        const shareOfStake = balance / rewardStake;
        
        // Calculate weekly rewards using current epoch tokens
        const weeklyReward = shareOfStake * tokens;
        
        // Calculate monthly rewards (approximately 4.33 weeks)
        const monthlyEpochs = 30.44 / 7;
        let monthlyReward = weeklyReward * monthlyEpochs;

        // Calculate yearly rewards with compound interest
        const EPOCHS_PER_YEAR = 52;
        let currentBalance = balance;
        let yearlyReward = 0;
        let currentShareOfStake = shareOfStake;

        for (let i = 0; i < EPOCHS_PER_YEAR; i++) {
          const epochReward = currentShareOfStake * tokens;
          yearlyReward += epochReward;

          // Update share of stake for compound interest
          currentBalance += epochReward;
          currentShareOfStake = currentBalance / rewardStake;
        }

        // Calculate expected blocks
        const blocksPerDay = (24 * 60 * 60) / 2.8; // Assuming 2.8 seconds per block
        const shareOfTotalStake = balance / Number(supply['online-money']);
        const expectedBlocksPerDay = blocksPerDay * shareOfTotalStake;
        const expectedBlocksPerWeek = expectedBlocksPerDay * 7;
        const expectedBlocksPerMonth = expectedBlocksPerDay * 30.44;

        primaryAccountInfo = {
          address: address,
          isParticipating: accountInfo?.status === 'Online',
          balance: balance / 1e6,
          blocksProduced24h: 0,
          expectedBlocksPerDay,
          expectedBlocksPerWeek,
          expectedBlocksPerMonth,
          estimatedRewardsPerDay: weeklyReward / 7,
          estimatedRewardsPerWeek: weeklyReward,
          estimatedRewardsPerMonth: monthlyReward
        };

        selectedWallet.set({address: address, app: ''});

        // Handle child accounts similarly
        const curl = `${config.lockvestApiBaseUrl}?owner=${address}`;
        const response = await fetch(curl, { cache: 'no-store' });
        const data = await response.json();

        await Promise.all(data.accounts.map(async (account: LockContract) => {
          const childAccountInfo = await getAccountInfo(account.contractAddress);
          const childBalance = Number(childAccountInfo?.amount ?? 0);
          const childShareOfStake = childBalance / rewardStake;
          
          // Calculate rewards for child account
          const childWeeklyReward = childShareOfStake * tokens;
          const childMonthlyReward = childWeeklyReward * monthlyEpochs;
          const childShareOfTotalStake = childBalance / Number(supply['online-money']);
          const childExpectedBlocksPerDay = blocksPerDay * childShareOfTotalStake;

          childAccounts = [...childAccounts, {
            address: account.contractAddress,
            isParticipating: childAccountInfo?.status === 'Online',
            balance: childBalance / 1e6,
            blocksProduced24h: 0,
            expectedBlocksPerDay: childExpectedBlocksPerDay,
            expectedBlocksPerWeek: childExpectedBlocksPerDay * 7,
            expectedBlocksPerMonth: childExpectedBlocksPerDay * 30.44,
            estimatedRewardsPerDay: childWeeklyReward / 7,
            estimatedRewardsPerWeek: childWeeklyReward,
            estimatedRewardsPerMonth: childMonthlyReward
          }];
        }));

      } catch (error) {
        console.error('Error updating account info:', error);
      }
    };

    $: {
        if (walletId && walletId.length > 0) {
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
    <div class="md:hidden flex-shrink-0 flex flex-col p-4 bg-gray-100 dark:bg-gray-800 relative z-30">
        <div class="flex items-center justify-between mb-4">
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

        {#if childAccounts.length > 0 && primaryAccountInfo}
            <div class="relative w-full" id="mobile-account-dropdown">
                <button
                    class="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 font-medium hover:border-purple-500 dark:hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                    on:click|stopPropagation={() => isDropdownOpen = !isDropdownOpen}
                >
                    {#if primaryAccountInfo && walletId}
                        <div class="flex items-center justify-between w-full">
                            <span class="flex items-center gap-2">
                                {#if primaryAccountInfo && parentWalletId == null}
                                    <span>Parent: {walletId.slice(0, 6)}...{walletId.slice(-4)}</span>
                                    <span class="text-gray-500 dark:text-gray-400">|</span>
                                    <span>{primaryAccountInfo.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                                    <span class="text-gray-500 dark:text-gray-400">|</span>
                                    <span class={primaryAccountInfo.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                                        {primaryAccountInfo.isParticipating ? '🟢' : '⚪'}
                                    </span>
                                {:else}
                                    {#each childAccounts as account}
                                        {#if account.address === walletId}
                                            <span>Staking: {account.address.slice(0, 4)}...{account.address.slice(-4)}</span>
                                            <span class="text-gray-500 dark:text-gray-400">|</span>
                                            <span>{account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                                            <span class="text-gray-500 dark:text-gray-400">|</span>
                                            <span class={account.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                                                {account.isParticipating ? '🟢' : '⚪'}
                                            </span>
                                        {/if}
                                    {/each}
                                {/if}
                            </span>
                            <svg class={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    {/if}
                </button>

                {#if isDropdownOpen}
                    <div class="fixed left-4 right-4 mt-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-40">
                        <button
                            class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700"
                            on:click={() => {
                                goto(`/wallet/${parentWalletId ?? walletId}`, { invalidateAll: true });
                                isDropdownOpen = false;
                            }}
                        >
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center justify-between">
                                    <span class="font-medium">Parent Account</span>
                                    <span class={primaryAccountInfo.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                                        {primaryAccountInfo.isParticipating ? '🟢 Online' : '⚪ Offline'}
                                    </span>
                                </div>
                                <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <span>{parentWalletId ? parentWalletId.slice(0, 6) : walletId.slice(0, 6)}...{parentWalletId ? parentWalletId.slice(-4) : walletId.slice(-4)}</span>
                                    <span class="text-gray-400">|</span>
                                    <span>{primaryAccountInfo.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                                </div>
                            </div>
                        </button>

                        {#each childAccounts as account}
                            <button
                                class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b last:border-b-0 border-gray-100 dark:border-gray-700"
                                on:click={() => {
                                    goto(`/wallet/${account.address}`, { invalidateAll: true });
                                    isDropdownOpen = false;
                                }}
                            >
                                <div class="flex flex-col gap-1">
                                    <div class="flex items-center justify-between">
                                        <span class="font-medium">Staking Account</span>
                                        <span class={account.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                                            {account.isParticipating ? '🟢 Online' : '⚪ Offline'}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                        <span>{account.address.slice(0, 6)}...{account.address.slice(-4)}</span>
                                        <span class="text-gray-400">|</span>
                                        <span>{account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                                    </div>
                                </div>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
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
        <div class="top-0 z-10 hidden md:flex w-full items-center justify-end p-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">

          <!-- Right side: Wallet controls -->
          <div class="flex items-center space-x-3">
            {#if childAccounts.length > 0}
              <div class="relative min-w-[400px]" id="account-dropdown">
                <button
                  class="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 font-medium hover:border-purple-500 dark:hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                  on:click|stopPropagation={toggleDropdown}
                >
                  {#if primaryAccountInfo && walletId}
                    <div class="flex items-center justify-between w-full">
                      <span class="flex items-center gap-2">
                        {#if primaryAccountInfo && parentWalletId == null}
                          <span>Parent: {walletId.slice(0, 6)}...{walletId.slice(-4)}</span>
                          <span class="text-gray-500 dark:text-gray-400">|</span>
                          <span>{primaryAccountInfo.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                          <span class="text-gray-500 dark:text-gray-400">|</span>
                          <span class={primaryAccountInfo.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                            {primaryAccountInfo.isParticipating ? '🟢 Online' : '⚪ Offline'}
                          </span>
                        {:else}
                          {#each childAccounts as account}
                            {#if account.address === walletId}
                              <span>Staking: {account.address.slice(0, 6)}...{account.address.slice(-4)}</span>
                              <span class="text-gray-500 dark:text-gray-400">|</span>
                              <span>{account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                              <span class="text-gray-500 dark:text-gray-400">|</span>
                              <span class={account.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                                {account.isParticipating ? '🟢 Online' : '⚪ Offline'}
                              </span>
                            {/if}
                          {/each}
                        {/if}
                      </span>
                      <svg class={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  {/if}
                </button>

                {#if isDropdownOpen && primaryAccountInfo}
                  <div class="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg max-h-[300px] overflow-y-auto">
                    <!-- Parent account option -->
                    <button
                      class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700"
                      on:click={() => {
                        goto(`/wallet/${parentWalletId ?? walletId}`, { invalidateAll: true });
                        isDropdownOpen = false;
                      }}
                    >
                      <div class="flex flex-col gap-1">
                        <div class="flex items-center justify-between">
                          <span class="font-medium">Parent Account</span>
                          <span class={primaryAccountInfo.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                            {primaryAccountInfo.isParticipating ? '🟢 Online' : '⚪ Offline'}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                          <span>{parentWalletId ? parentWalletId.slice(0, 6) : walletId.slice(0, 6)}...{parentWalletId ? parentWalletId.slice(-4) : walletId.slice(-4)}</span>
                          <span class="text-gray-400">|</span>
                          <span>{primaryAccountInfo.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                        </div>
                      </div>
                    </button>
                    
                    {#each childAccounts as account}
                      <button
                        class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b last:border-b-0 border-gray-100 dark:border-gray-700"
                        on:click={() => {
                          goto(`/wallet/${account.address}`, { invalidateAll: true });
                          isDropdownOpen = false;
                        }}
                      >
                        <div class="flex flex-col gap-1">
                          <div class="flex items-center justify-between">
                            <span class="font-medium">Staking Account</span>
                            <span class={account.isParticipating ? 'text-green-500' : 'text-gray-500'}>
                              {account.isParticipating ? '🟢 Online' : '⚪ Offline'}
                            </span>
                          </div>
                          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <span>{account.address.slice(0, 6)}...{account.address.slice(-4)}</span>
                            <span class="text-gray-400">|</span>
                            <span>{account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} VOI</span>
                          </div>
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            <div class="">
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
                walletListClass="bg-gray-50 dark:bg-slate-700 dark:text-gray-200"
                allowWatchAccounts={true}
                showAuthenticated={false}
                modalType="dropdown"
              />
            </div>
          </div>
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
                    <ProposalsComponent walletId={walletId} />
                {:else if activeSection === 'calculator'}
                    <h2 class="text-xl md:text-2xl font-bold mb-4">Calculator</h2>
                    <CalculatorComponent walletAddress={walletId} />
                {:else if activeSection === 'epochs'}
                    <EpochComponent walletAddress={walletId} />
                {/if}
            {:else}
                {#if activeSection === 'calculator'}
                    <CalculatorComponent />
                {:else}
                    <p class="text-gray-600">Please connect a wallet to view account information.</p>
                {/if}
            {/if}
        </div>
    </main>
  </div>
