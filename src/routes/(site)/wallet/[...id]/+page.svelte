<script lang="ts">
    import { Web3Wallet, selectedWallet } from 'avm-wallet-svelte';
    import { algodClient, algodIndexer } from '$lib/utils/algod';
    import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';
    import AccountInfo from '$lib/components/wallet/AccountInfo.svelte';
    import TotalAccountsInfo from '$lib/components/wallet/TotalAccountsInfo.svelte';
    import { config } from '$lib/config';
    import type { LockContract } from '$lib/data/types';
	  import { goto } from '$app/navigation';
	  import { onMount } from 'svelte';
    import NodeComponent from '$lib/component/NodeComponent.svelte';
    import ProposalsComponent from '$lib/component/ProposalsComponent.svelte';
    import { getAccountInfo, getSupplyInfo, getConsensusInfo } from '$lib/stores/accounts';

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

    selectedWallet.subscribe((wallet) => {
        if (!loading && wallet && wallet.address && wallet.address.length > 0 && walletId != wallet.address) {
            activeSection = 'consensus';
            goto(`/wallet/${wallet.address}`);
        }
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
        supply = await getSupplyInfo();
        const accountInfo = await getAccountInfo(address);
        //const apiData = await getConsensusInfo(address);

        primaryAccountInfo = {
          address: address,
          isParticipating: accountInfo?.status === 'Online',
          balance: Number(accountInfo?.amount??0) / 1e6,
          blocksProduced24h: 0,
          expectedBlocksPerDay: calculateExpectedBlocks(1, Number(accountInfo?.amount??0)),
          expectedBlocksPerWeek: calculateExpectedBlocks(7, Number(accountInfo?.amount??0)),
          expectedBlocksPerMonth: calculateExpectedBlocks(30, Number(accountInfo?.amount??0))
        }

        // get child accounts from staking api
        const curl = `${config.lockvestApiBaseUrl}?owner=${address}`;
        fetch(curl, { cache: 'no-store' })
            .then((response) => response.json())
            .then((data) => {
              data.accounts.forEach(async (account: LockContract) => {
                  const accountInfo = await getAccountInfo(account.contractAddress);

                  childAccounts.push({
                      address: account.contractAddress,
                      isParticipating: accountInfo?.status === 'Online',
                      balance: Number(accountInfo?.amount??0) / 1e6,
                      blocksProduced24h: 0,
                      expectedBlocksPerDay: calculateExpectedBlocks(1, Number(accountInfo?.amount??0)),
                      expectedBlocksPerWeek: calculateExpectedBlocks(7, Number(accountInfo?.amount??0)),
                      expectedBlocksPerMonth: calculateExpectedBlocks(30, Number(accountInfo?.amount??0))
                  });
              });
            });

      } catch (error) {
        console.error(error);
      }
    }

    $: {
      if (parentWalletId) {
        updateAccountInfo(parentWalletId);
      } else if (walletId && walletId.length > 0) {
        updateAccountInfo(walletId);
      }
    }
  </script>
  
  <div class="flex h-fit min-h-screen">
    <aside class="w-64 bg-gray-100 dark:bg-gray-800 p-5">
      <nav>
        <ul class="space-y-2">
          {#each sections as section}
            <li>
              <button
                class="w-full text-left py-2 px-4 rounded transition-colors duration-200 ease-in-out {activeSection === section.id ? 'bg-gray-200 dark:bg-gray-700 font-bold' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}"
                on:click={() => setActiveSection(section.id)}
              >
                {section.name}
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>
    
    <main class="flex-grow p-5 bg-white dark:bg-gray-900">
      <div class="w-full flex justify-end mb-4">
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

      {#if walletId}
        {#if activeSection === 'staking'}
          <div class="space-y-6">
            {#if primaryAccountInfo}
              <h3 class="text-xl font-semibold mb-2">Primary Account</h3>
              <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow">
                <AccountInfo account={primaryAccountInfo} addressLink={walletId != primaryAccountInfo.address} />
              </div>
            {:else}
              <p class="text-gray-600">Loading...</p>
            {/if}
            
            {#if childAccounts.length > 0}
              <div class="space-y-4">
                <h3 class="text-xl font-semibold">Staking Contracts</h3>
                {#each childAccounts as childAccount}
                  {#if childAccount.balance > 0.1}
                    <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow">
                      <AccountInfo account={childAccount} addressLink={walletId != childAccount.address} />
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
            
            <!--<div class="bg-gray-100 p-4 rounded-lg shadow">
              <h3 class="text-xl font-semibold mb-2">Total for All Accounts</h3>
              <TotalAccountsInfo accounts={[...childAccounts]} />
            </div>-->
          </div>
        {:else if activeSection === 'consensus'}
          <h2 class="text-2xl font-bold mb-4">Consensus</h2>
          <NodeComponent walletId={walletId} />
        {:else if activeSection === 'proposals'}
          <h2 class="text-2xl font-bold mb-4">Proposals</h2>
          <ProposalsComponent walletId={walletId} />
        {/if}
      {:else}
        <p class="text-gray-600">Please connect a wallet to view account information.</p>
      {/if}
    </main>
  </div>
