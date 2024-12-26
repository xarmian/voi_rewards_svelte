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

<div class="container mx-auto px-4 py-8 text-white">
    <h1 class="text-3xl font-bold mb-6">Weekly Relay Statistics</h1>

    <div class="mb-8 flex gap-4 items-center">
        <select
            class="bg-gray-700 text-white px-4 py-2 rounded-lg"
            bind:value={selectedWeek}
        >
            {#each data.weeks as week}
                <option value={week}>{week.label}</option>
            {/each}
        </select>

        <input
            type="text"
            placeholder="Filter by hostname..."
            class="bg-gray-700 text-white px-4 py-2 rounded-lg flex-grow"
            bind:value={searchTerm}
        />

        {#if peerData.length > 0}
            <button
                on:click={downloadCsv}
                class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Download CSV
            </button>
        {/if}
    </div>

    {#if weekStats}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div class="bg-gray-800 rounded-lg p-4">
                <h3 class="text-sm text-gray-400 mb-1">Reward Pool</h3>
                <p class="text-2xl font-bold">{weekStats.rewardPool.toLocaleString()} VOI</p>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
                <h3 class="text-sm text-gray-400 mb-1">Total Relays</h3>
                <p class="text-2xl font-bold">{weekStats.totalHosts}</p>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
                <h3 class="text-sm text-gray-400 mb-1">Avg Peers per Relay</h3>
                <p class="text-2xl font-bold">{formatNumber(weekStats.avgPeersPerHost)}</p>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
                <h3 class="text-sm text-gray-400 mb-1">Avg Reward per Relay</h3>
                <p class="text-2xl font-bold">{formatNumber(weekStats.avgRewardPerHost)} VOI</p>
            </div>
        </div>
    {/if}

    {#if error}
        <div class="bg-red-500 text-white p-4 rounded-lg mb-8">
            {error}
        </div>
    {/if}

    {#if isLoading}
        <div class="flex justify-center my-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
    {:else if filteredData.length}
        <div class="overflow-x-auto">
            <table class="min-w-full bg-gray-800 rounded-lg overflow-hidden">
                <thead class="bg-gray-700">
                    <tr>
                        <th 
                            class="px-4 py-2 text-left cursor-pointer hover:bg-gray-600"
                            on:click={() => handleSort('host_name')}
                        >
                            Relay
                            {#if sortField === 'host_name'}
                                <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            {/if}
                        </th>
                        {#each dates as date}
                            <th 
                                class="px-4 py-2 text-center cursor-pointer hover:bg-gray-600 whitespace-nowrap"
                                on:click={() => handleSort(`daily_${date}`)}
                            >
                                {formatDate(date)}
                                {#if sortField === `daily_${date}`}
                                    <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                {/if}
                            </th>
                        {/each}
                        <th 
                            class="px-4 py-2 text-center cursor-pointer hover:bg-gray-600"
                            on:click={() => handleSort('total_peers')}
                        >
                            Total
                            {#if sortField === 'total_peers'}
                                <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            {/if}
                        </th>
                        <th 
                            class="px-4 py-2 text-center cursor-pointer hover:bg-gray-600"
                            on:click={() => handleSort('percentage')}
                        >
                            %
                            {#if sortField === 'percentage'}
                                <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            {/if}
                        </th>
                        <th 
                            class="px-4 py-2 text-center cursor-pointer hover:bg-gray-600"
                            on:click={() => handleSort('reward')}
                        >
                            Reward
                            {#if sortField === 'reward'}
                                <span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            {/if}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {#each filteredData as host}
                        <tr class="border-t border-gray-700">
                            <td class="px-4 py-2 font-mono">{host.host_name}</td>
                            {#each dates as date}
                                <td class="px-4 py-2 text-center">
                                    {host.daily_peers[date] ? formatNumber(host.daily_peers[date]) : '-'}
                                </td>
                            {/each}
                            <td class="px-4 py-2 text-center font-medium">
                                {formatNumber(host.total_peers)}
                            </td>
                            <td class="px-4 py-2 text-center">
                                {formatNumber(host.percentage)}%
                            </td>
                            <td class="px-4 py-2 text-center">
                                {formatNumber(host.reward)}
                            </td>
                        </tr>
                    {/each}
                    <tr class="border-t border-gray-700">
                        <td class="px-4 py-2 font-mono">Total</td>
                        {#each dates as date}
                            <td class="px-4 py-2 text-center">{Math.round(filteredData.reduce((sum, host) => sum + host.daily_peers[date], 0) || 0)}</td>
                        {/each}
                        <td class="px-4 py-2 text-center font-medium">{Math.round(filteredData.reduce((sum, host) => sum + host.total_peers, 0))}</td>
                        <td class="px-4 py-2 text-center">{Math.round(filteredData.reduce((sum, host) => sum + host.percentage, 0))}%</td>
                        <td class="px-4 py-2 text-center">{Math.round(filteredData.reduce((sum, host) => sum + host.reward, 0) * 100) / 100}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    {:else}
        <p class="text-center text-gray-400">No data available for the selected week.</p>
    {/if}
</div> 