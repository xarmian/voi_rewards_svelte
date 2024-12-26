<script lang="ts">
    import { supabasePublicClient } from '$lib/supabase';
    import type { PageData } from './$types';
    import type { PeerRecord } from '$lib/types';
    import { onMount } from 'svelte';
    import { getTokensByEpoch } from '$lib/utils';
    import { getCurrentEpoch } from '$lib/utils/epoch-utils';

    export let data: PageData;

    interface PeerData {
        host_name: string;
        daily_peers: Record<string, number>;
        total_peers: number;
        percentage: number;
        reward: number;
    }

    interface WeekStats {
        rewardPool: number;
        avgPeersPerHost: number;
        avgRewardPerHost: number;
        totalHosts: number;
        totalPeers: number;
    }

    let selectedWeek = data.defaultWeek;
    let peerData: PeerData[] = [];
    let filteredData: PeerData[] = [];
    let isLoading = false;
    let error: string | null = null;
    let dates: string[] = [];
    let searchTerm = '';
    let sortField: 'host_name' | 'total_peers' | 'percentage' | 'reward' | `daily_${string}` = 'host_name';
    let sortDirection: 'asc' | 'desc' = 'asc';
    let weekStats: WeekStats | null = null;

    function sortData(data: PeerData[], field: typeof sortField, direction: typeof sortDirection) {
        return [...data].sort((a, b) => {
            let valueA: number | string;
            let valueB: number | string;

            if (field === 'host_name') {
                valueA = a.host_name;
                valueB = b.host_name;
            } else if (field.startsWith('daily_')) {
                const date = field.replace('daily_', '');
                valueA = a.daily_peers[date] || 0;
                valueB = b.daily_peers[date] || 0;
            } else {
                valueA = a[field as keyof Pick<PeerData, 'total_peers' | 'percentage' | 'reward'>];
                valueB = b[field as keyof Pick<PeerData, 'total_peers' | 'percentage' | 'reward'>];
            }

            if (direction === 'asc') {
                return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
            } else {
                return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
            }
        });
    }

    function handleSort(field: typeof sortField) {
        if (sortField === field) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDirection = 'asc';
        }
        updateFilteredData();
    }

    function updateFilteredData() {
        filteredData = peerData
            .filter(host => 
                searchTerm === '' || 
                host.host_name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        filteredData = sortData(filteredData, sortField, sortDirection);
    }

    $: {
        if (searchTerm !== undefined) {
            updateFilteredData();
        }
    }

    async function calculateWeekStats(weekStart: string) {
        try {
            // Calculate which epoch this week represents
            const epochStartDate = new Date('2024-10-30');
            const weekStartDate = new Date(weekStart);
            const epochNumber = getCurrentEpoch(weekStartDate, epochStartDate) + 1;
            
            // Get reward pool for this epoch
            const rewardPool = await getTokensByEpoch(epochNumber) / 10;

            // Calculate statistics
            const totalHosts = peerData.length;
            const totalPeers = peerData.reduce((sum, host) => sum + host.total_peers, 0);
            const avgPeersPerHost = totalHosts > 0 ? totalPeers / totalHosts : 0;
            const avgRewardPerHost = totalHosts > 0 ? rewardPool / totalHosts : 0;

            weekStats = {
                rewardPool,
                avgPeersPerHost,
                avgRewardPerHost,
                totalHosts,
                totalPeers
            };

            // Update rewards for each host
            peerData = peerData.map(host => ({
                ...host,
                reward: (host.percentage / 100) * rewardPool
            }));

            updateFilteredData();
        } catch (e) {
            console.error('Error calculating week stats:', e);
            error = 'Failed to calculate rewards';
        }
    }

    async function fetchWeekData(start: string, end: string) {
        isLoading = true;
        error = null;
        weekStats = null;

        try {
            const { data: rawData, error: queryError } = await supabasePublicClient
                .from('vr_relay_peers')
                .select('*')
                .gte('peer_date', start)
                .lte('peer_date', end)
                .order('host_name')
                .returns<PeerRecord[]>();

            if (queryError) throw queryError;

            // Generate array of dates in the week
            const dateArray = [];
            const [startYear, startMonth, startDay] = start.split('-').map(Number);
            const [endYear, endMonth, endDay] = end.split('-').map(Number);
            const currentDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
            const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));
            
            while (currentDate <= endDate) {
                dateArray.push(currentDate.toISOString().split('T')[0]);
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
            dates = dateArray;

            // Process the data
            const hostMap = new Map<string, PeerData>();
            let totalPeersAllHosts = 0;

            // Initialize host data
            const uniqueHosts = [...new Set(rawData.map(row => row.host_name))];
            uniqueHosts.forEach(host => {
                hostMap.set(host, {
                    host_name: host,
                    daily_peers: {},
                    total_peers: 0,
                    percentage: 0,
                    reward: 0
                });
            });

            // Fill in peer counts
            rawData.forEach(row => {
                const hostData = hostMap.get(row.host_name)!;
                hostData.daily_peers[row.peer_date] = row.peer_count;
                hostData.total_peers += row.peer_count;
                totalPeersAllHosts += row.peer_count;
            });

            // Calculate percentages
            hostMap.forEach(host => {
                host.percentage = (host.total_peers / totalPeersAllHosts) * 100;
            });

            peerData = Array.from(hostMap.values());
            
            // Calculate week stats and rewards
            await calculateWeekStats(start);
            
        } catch (e) {
            error = e instanceof Error ? e.message : 'An unknown error occurred';
            console.error('Error fetching peer data:', e);
        } finally {
            isLoading = false;
        }
    }

    $: if (selectedWeek) {
        fetchWeekData(selectedWeek.start, selectedWeek.end);
    }

    function formatNumber(num: number): string {
        return num.toFixed(1);
    }

    function formatDate(dateStr: string): string {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            timeZone: 'UTC'
        });
    }

    async function downloadCsv() {
        try {
            // First, get all wallet mappings
            const { data: walletMappings, error: mappingError } = await supabasePublicClient
                .from('vr_relay_wallets')
                .select('host_prefix, wallet_address');

            if (mappingError) throw mappingError;

            // Create a map for quick lookups
            const walletMap = new Map(
                walletMappings?.map(m => [m.host_prefix, m.wallet_address]) || []
            );

            // Aggregate rewards by account (first section of hostname)
            const accountRewards = new Map<string, {
                identifier: string;  // Either wallet address or host prefix
                reward: number;
            }>();
            
            peerData.forEach(host => {
                const hostPrefix = host.host_name.split('-')[0];
                const identifier = walletMap.get(hostPrefix) || hostPrefix;
                const current = accountRewards.get(identifier) || { identifier, reward: 0 };
                current.reward += host.reward;
                accountRewards.set(identifier, current);
            });

            // Create CSV content
            const csvRows = ['account,userType,tokenAmount'];
            accountRewards.forEach(({ identifier, reward }) => {
                csvRows.push(`${identifier},relay,${Math.round(reward * Math.pow(10,6))}`);
            });

            // Create and trigger download
            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', `relay-rewards-${selectedWeek.start}.csv`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Error downloading CSV:', e);
            error = e instanceof Error ? e.message : 'Failed to download CSV';
        }
    }
</script>

<div class="bg-blue-50 dark:bg-blue-900/80 min-h-screen">
    <div class="container mx-auto px-2 sm:px-4 py-4 sm:py-8 text-gray-900 dark:text-white">
        <h1 class="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Weekly Relay Statistics</h1>

        <!-- Mobile-friendly controls -->
        <div class="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
            <select
                class="bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 w-full sm:w-auto"
                bind:value={selectedWeek}
            >
                {#each data.weeks as week}
                    <option value={week}>{week.label}</option>
                {/each}
            </select>

            <div class="flex gap-2 sm:gap-4 flex-1">
                <input
                    type="text"
                    placeholder="Filter by hostname..."
                    class="bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 flex-1 dark:placeholder-gray-400 min-w-0"
                    bind:value={searchTerm}
                />

                {#if peerData.length > 0}
                    <button
                        on:click={downloadCsv}
                        class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                        <span class="hidden sm:inline">Download CSV</span>
                    </button>
                {/if}
            </div>
        </div>

        {#if weekStats}
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Reward Pool</h3>
                    <p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{weekStats.rewardPool.toLocaleString()} VOI</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Total Relays</h3>
                    <p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{weekStats.totalHosts}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Avg Peers per Relay</h3>
                    <p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(weekStats.avgPeersPerHost)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Avg Reward per Relay</h3>
                    <p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(weekStats.avgRewardPerHost)} VOI</p>
                </div>
            </div>
        {/if}

        {#if error}
            <div class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 p-3 sm:p-4 rounded-lg mb-6 sm:mb-8 border border-red-200 dark:border-red-800 text-sm sm:text-base">
                {error}
            </div>
        {/if}

        {#if isLoading}
            <div class="flex justify-center my-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
            </div>
        {:else if filteredData.length}
            <div class="overflow-x-auto -mx-2 sm:mx-0">
                <div class="inline-block min-w-full align-middle">
                    <table class="min-w-full bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th 
                                    class="sticky left-0 bg-gray-50 dark:bg-gray-700 px-3 sm:px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors text-xs sm:text-sm z-10"
                                    on:click={() => handleSort('host_name')}
                                >
                                    Relay
                                    {#if sortField === 'host_name'}
                                        <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                    {/if}
                                </th>
                                {#each dates as date}
                                    <th 
                                        class="px-3 sm:px-4 py-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium whitespace-nowrap transition-colors text-xs sm:text-sm"
                                        on:click={() => handleSort(`daily_${date}`)}
                                    >
                                        {formatDate(date)}
                                        {#if sortField === `daily_${date}`}
                                            <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                        {/if}
                                    </th>
                                {/each}
                                <th 
                                    class="px-3 sm:px-4 py-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors text-xs sm:text-sm"
                                    on:click={() => handleSort('total_peers')}
                                >
                                    Total
                                    {#if sortField === 'total_peers'}
                                        <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                    {/if}
                                </th>
                                <th 
                                    class="px-3 sm:px-4 py-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors text-xs sm:text-sm"
                                    on:click={() => handleSort('percentage')}
                                >
                                    %
                                    {#if sortField === 'percentage'}
                                        <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                    {/if}
                                </th>
                                <th 
                                    class="px-3 sm:px-4 py-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors text-xs sm:text-sm"
                                    on:click={() => handleSort('reward')}
                                >
                                    Reward
                                    {#if sortField === 'reward'}
                                        <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                    {/if}
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            {#each filteredData as host}
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td class="sticky left-0 bg-white dark:bg-gray-800 px-3 sm:px-4 py-2 font-mono text-gray-900 dark:text-gray-200 text-xs sm:text-sm whitespace-nowrap">{host.host_name}</td>
                                    {#each dates as date}
                                        <td class="px-3 sm:px-4 py-2 text-center text-gray-700 dark:text-gray-300 text-xs sm:text-sm">
                                            {host.daily_peers[date] ? formatNumber(host.daily_peers[date]) : '-'}
                                        </td>
                                    {/each}
                                    <td class="px-3 sm:px-4 py-2 text-center font-medium text-gray-900 dark:text-gray-200 text-xs sm:text-sm">
                                        {formatNumber(host.total_peers)}
                                    </td>
                                    <td class="px-3 sm:px-4 py-2 text-center text-gray-700 dark:text-gray-300 text-xs sm:text-sm">
                                        {formatNumber(host.percentage)}%
                                    </td>
                                    <td class="px-3 sm:px-4 py-2 text-center text-gray-900 dark:text-gray-200 text-xs sm:text-sm">
                                        {formatNumber(host.reward)}
                                    </td>
                                </tr>
                            {/each}
                            <tr class="bg-gray-50 dark:bg-gray-700/50 font-medium">
                                <td class="sticky left-0 bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2 font-mono text-gray-900 dark:text-gray-200 text-xs sm:text-sm whitespace-nowrap">Total</td>
                                {#each dates as date}
                                    <td class="px-3 sm:px-4 py-2 text-center text-gray-900 dark:text-gray-200 text-xs sm:text-sm">
                                        {Math.round(filteredData.reduce((sum, host) => sum + host.daily_peers[date], 0) || 0)}
                                    </td>
                                {/each}
                                <td class="px-3 sm:px-4 py-2 text-center text-gray-900 dark:text-gray-200 text-xs sm:text-sm">
                                    {Math.round(filteredData.reduce((sum, host) => sum + host.total_peers, 0))}
                                </td>
                                <td class="px-3 sm:px-4 py-2 text-center text-gray-900 dark:text-gray-200 text-xs sm:text-sm">
                                    {Math.round(filteredData.reduce((sum, host) => sum + host.percentage, 0))}%
                                </td>
                                <td class="px-3 sm:px-4 py-2 text-center text-gray-900 dark:text-gray-200 text-xs sm:text-sm">
                                    {Math.round(filteredData.reduce((sum, host) => sum + host.reward, 0) * 100) / 100}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        {:else}
            <p class="text-center text-gray-500 dark:text-gray-400 text-sm sm:text-base">No data available for the selected week.</p>
        {/if}
    </div>
</div>
