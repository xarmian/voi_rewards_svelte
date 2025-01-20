<script lang="ts">
    import { onMount, afterUpdate } from 'svelte';
    import { formatNumber } from '$lib/utils';
    import * as echarts from 'echarts';
    import type { EChartsOption } from 'echarts';

    interface EpochData {
        epoch_number: number;
        epoch_start: string;
        epoch_end: string;
        reward: number;
        online_stake: number;
        ballast_stake: number;
        eligible_online_stake: number;
        apr: number;
        participating_wallets: number;
    }

    interface PriceData {
        time: string;
        value: number;
    }

    interface DailyPrice {
        date: string;
        value: number;
    }

    let epochs: EpochData[] = [];
    let currentEpoch: number;
    let loading = true;
    let error: string | null = null;
    let aprChartDiv: HTMLElement;
    let stakeChartDiv: HTMLElement;
    let walletsChartDiv: HTMLElement;
    let priceChartDiv: HTMLElement;
    let aprChart: echarts.ECharts | null = null;
    let stakeChart: echarts.ECharts | null = null;
    let walletsChart: echarts.ECharts | null = null;
    let priceChart: echarts.ECharts | null = null;
    let mounted = false;
    let currentPrice: number | null = null;
    let priceChange24h: number | null = null;
    let priceHistory: PriceData[] = [];
    let onlineAccountCount: number | null = null;

    onMount(() => {
        mounted = true;
        const fetchData = async () => {
            try {
                const [epochsResponse, marketsResponse, priceHistoryResponse, onlineAccountsResponse] = await Promise.all([
                    fetch('/api/epochs'),
                    fetch('/api/markets?token=VOI'),
                    fetch('/api/price-history?period=7d'),
                    fetch('/api/mimir')
                ]);
                
                const epochsData = await epochsResponse.json();
                const marketsData = await marketsResponse.json();
                const priceHistoryData = await priceHistoryResponse.json();
                const onlineAccountsData = await onlineAccountsResponse.json();
                
                if ('error' in epochsData) {
                    throw new Error(epochsData.error);
                }
                
                epochs = epochsData.epochs;
                currentEpoch = epochsData.current_epoch;
                onlineAccountCount = onlineAccountsData.data;
                
                if (marketsData.aggregates) {
                    currentPrice = marketsData.aggregates.weightedAveragePrice;
                    const firstMarket = marketsData.marketData[0];
                    if (firstMarket) {
                        priceChange24h = firstMarket.price_change_percentage_24h;
                    }
                }

                if (Array.isArray(priceHistoryData)) {
                    priceHistory = priceHistoryData;
                }
                
                loading = false;
            } catch (e) {
                error = e instanceof Error ? e.message : 'Failed to load data';
                loading = false;
            }
        };

        fetchData();

        const handleResize = () => {
            aprChart?.resize();
            stakeChart?.resize();
            walletsChart?.resize();
            priceChart?.resize();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (aprChart) {
                aprChart.dispose();
                aprChart = null;
            }
            if (stakeChart) {
                stakeChart.dispose();
                stakeChart = null;
            }
            if (walletsChart) {
                walletsChart.dispose();
                walletsChart = null;
            }
            if (priceChart) {
                priceChart.dispose();
                priceChart = null;
            }
            mounted = false;
        };
    });

    afterUpdate(() => {
        if (mounted && !loading && !error && epochs.length > 0) {
            initCharts();
        }
    });

    function calculateDailyAverages(priceData: PriceData[]): DailyPrice[] {
        const dailyPrices = new Map<string, { sum: number; count: number }>();
        
        priceData.forEach(({ time, value }) => {
            const date = new Date(parseInt(time) * 1000).toLocaleDateString();
            const current = dailyPrices.get(date) || { sum: 0, count: 0 };
            dailyPrices.set(date, {
                sum: current.sum + value,
                count: current.count + 1
            });
        });

        return Array.from(dailyPrices.entries())
            .map(([date, { sum, count }]) => ({
                date,
                value: sum / count
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    function formatDateLabel(dateStr: string): string {
        const date = new Date(dateStr);
        const today = new Date();
        
        // Reset time components to compare just the dates
        date.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        
        // If date is greater than or equal to today, show 'Today'
        if (date >= today) {
            return 'Today';
        }
        return date.toLocaleDateString();
    }

    function initCharts() {
        if (!aprChartDiv || !stakeChartDiv || !walletsChartDiv || !priceChartDiv) return;

        const isDarkMode = document.documentElement.classList.contains('dark');
        const textColor = isDarkMode ? '#9CA3AF' : '#4B5563';
        const gridColor = isDarkMode ? '#374151' : '#E5E7EB';
        const backgroundColor = isDarkMode ? 'transparent' : 'transparent';

        // APR Line Chart
        const aprOptions: EChartsOption = {
            backgroundColor,
            tooltip: {
                trigger: 'axis',
                backgroundColor: isDarkMode ? '#1F2937' : 'white',
                borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                textStyle: {
                    color: textColor
                },
                formatter: (params: any) => {
                    const data = Array.isArray(params) ? params[0] : params;
                    const epoch = epochs[data.dataIndex];
                    const dateLabel = formatDateLabel(epoch.epoch_end);
                    return `Epoch ${epoch.epoch_number} (${dateLabel})<br/>APR: ${data.value.toFixed(2)}%`;
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: epochs.map(e => formatDateLabel(e.epoch_end)),
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    rotate: 45
                }
            },
            yAxis: {
                type: 'value',
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                splitLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    formatter: '{value}%'
                }
            },
            series: [{
                data: epochs.map(e => e.apr),
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 8,
                lineStyle: {
                    color: isDarkMode ? '#34D399' : '#10B981',
                    width: 3
                },
                itemStyle: {
                    color: isDarkMode ? '#34D399' : '#10B981',
                    borderColor: isDarkMode ? '#1F2937' : 'white',
                    borderWidth: 2
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        {
                            offset: 0,
                            color: isDarkMode ? 'rgba(52, 211, 153, 0.3)' : 'rgba(16, 185, 129, 0.3)'
                        },
                        {
                            offset: 1,
                            color: isDarkMode ? 'rgba(52, 211, 153, 0.0)' : 'rgba(16, 185, 129, 0.0)'
                        }
                    ])
                }
            }]
        };

        // Stake Distribution Chart
        const stakeOptions: EChartsOption = {
            backgroundColor,
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross'
                },
                backgroundColor: isDarkMode ? '#1F2937' : 'white',
                borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                textStyle: {
                    color: textColor
                },
                formatter: (params: any) => {
                    if (!Array.isArray(params)) return '';
                    let result = `${params[0].name}<br/>`;
                    
                    // Find community and ballast stake values
                    const communityStake = params.find((p: any) => p.seriesName === 'Community Stake')?.value || 0;
                    const ballastStake = params.find((p: any) => p.seriesName === 'Ballast and BA Stake')?.value || 0;
                    const totalStake = communityStake + ballastStake;
                    
                    // Add total stake first
                    const totalColor = isDarkMode ? '#34D399' : '#10B981';
                    result += `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${totalColor};"></span>Total Stake: ${totalStake.toFixed(3)}M<br/>`;
                    
                    // Add other values
                    params.forEach((param: any) => {
                        const color = param.color;
                        const marker = `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${color};"></span>`;
                        result += `${marker}${param.seriesName}: ${param.value.toFixed(3)}M<br/>`;
                    });
                    return result;
                }
            },
            legend: {
                data: ['Total Stake', 'Community Stake', 'Ballast and BA Stake', 'Eligible Stake'],
                textStyle: {
                    color: textColor
                },
                top: 0
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '40px',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: epochs.map(e => formatDateLabel(e.epoch_end)),
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    rotate: 45
                }
            },
            yAxis: {
                type: 'value',
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                splitLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    formatter: '{value}M'
                }
            },
            series: [
                {
                    name: 'Community Stake',
                    type: 'bar',
                    stack: 'total',
                    data: epochs.map(e => (e.online_stake - e.ballast_stake) / 1_000_000),
                    itemStyle: {
                        color: isDarkMode ? '#818CF8' : '#6366F1'
                    }
                },
                {
                    name: 'Ballast and BA Stake',
                    type: 'bar',
                    stack: 'total',
                    data: epochs.map(e => e.ballast_stake / 1_000_000),
                    itemStyle: {
                        color: isDarkMode ? '#F87171' : '#EF4444'
                    },
                    label: {
                        show: true,
                        position: 'top',
                        formatter: (params: any) => {
                            const index = params.dataIndex;
                            const total = epochs[index].online_stake / 1_000_000;
                            return total.toFixed(1) + 'M';
                        },
                        distance: 5,
                        color: textColor
                    }
                },
                {
                    name: 'Eligible Stake',
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    data: epochs.map(e => e.eligible_online_stake / 1_000_000),
                    lineStyle: {
                        color: isDarkMode ? '#F59E0B' : '#D97706',
                        width: 3
                    },
                    itemStyle: {
                        color: isDarkMode ? '#F59E0B' : '#D97706',
                        borderColor: isDarkMode ? '#1F2937' : 'white',
                        borderWidth: 2
                    }
                }
            ]
        };

        // Participating Wallets Chart
        const walletsOptions: EChartsOption = {
            backgroundColor,
            tooltip: {
                trigger: 'axis',
                backgroundColor: isDarkMode ? '#1F2937' : 'white',
                borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                textStyle: {
                    color: textColor
                },
                formatter: (params: any) => {
                    const data = Array.isArray(params) ? params[0] : params;
                    const epoch = epochs[data.dataIndex];
                    const dateLabel = formatDateLabel(epoch.epoch_end);
                    return `Epoch ${epoch.epoch_number} (${dateLabel})<br/>Accounts: ${formatNumber(data.value)}`;
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: epochs.map(e => formatDateLabel(e.epoch_end)),
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    rotate: 45
                }
            },
            yAxis: {
                type: 'value',
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                splitLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    formatter: (value: number) => formatNumber(value)
                }
            },
            series: [{
                data: epochs.map(e => e.participating_wallets),
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 8,
                lineStyle: {
                    color: isDarkMode ? '#F59E0B' : '#D97706',
                    width: 3
                },
                itemStyle: {
                    color: isDarkMode ? '#F59E0B' : '#D97706',
                    borderColor: isDarkMode ? '#1F2937' : 'white',
                    borderWidth: 2
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        {
                            offset: 0,
                            color: isDarkMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.3)'
                        },
                        {
                            offset: 1,
                            color: isDarkMode ? 'rgba(245, 158, 11, 0.0)' : 'rgba(217, 119, 6, 0.0)'
                        }
                    ])
                }
            }]
        };

        // Calculate daily averages for price data
        const dailyPrices = calculateDailyAverages(priceHistory);

        // Price Chart
        const priceOptions: EChartsOption = {
            backgroundColor,
            tooltip: {
                trigger: 'axis',
                backgroundColor: isDarkMode ? '#1F2937' : 'white',
                borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                textStyle: {
                    color: textColor
                },
                formatter: (params: any) => {
                    const data = Array.isArray(params) ? params[0] : params;
                    return `${data.name}<br/>Price: $${data.value.toFixed(6)}`;
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: dailyPrices.map(p => p.date),
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    rotate: 45
                }
            },
            yAxis: {
                type: 'value',
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                splitLine: {
                    lineStyle: { color: gridColor }
                },
                axisLabel: {
                    color: textColor,
                    formatter: '${value}'
                }
            },
            series: [{
                data: dailyPrices.map(p => p.value),
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 8,
                lineStyle: {
                    color: isDarkMode ? '#60A5FA' : '#3B82F6',
                    width: 3
                },
                itemStyle: {
                    color: isDarkMode ? '#60A5FA' : '#3B82F6',
                    borderColor: isDarkMode ? '#1F2937' : 'white',
                    borderWidth: 2
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        {
                            offset: 0,
                            color: isDarkMode ? 'rgba(96, 165, 250, 0.3)' : 'rgba(59, 130, 246, 0.3)'
                        },
                        {
                            offset: 1,
                            color: isDarkMode ? 'rgba(96, 165, 250, 0.0)' : 'rgba(59, 130, 246, 0.0)'
                        }
                    ])
                }
            }]
        };

        try {
            // Dispose of existing charts if they exist
            if (aprChart) {
                aprChart.dispose();
            }
            if (stakeChart) {
                stakeChart.dispose();
            }
            if (walletsChart) {
                walletsChart.dispose();
            }
            if (priceChart) {
                priceChart.dispose();
            }

            // Initialize new charts
            aprChart = echarts.init(aprChartDiv);
            stakeChart = echarts.init(stakeChartDiv);
            walletsChart = echarts.init(walletsChartDiv);
            priceChart = echarts.init(priceChartDiv);

            // Set options
            aprChart.setOption(aprOptions);
            stakeChart.setOption(stakeOptions);
            walletsChart.setOption(walletsOptions);
            priceChart.setOption(priceOptions);
        } catch (e) {
            console.error('Failed to initialize charts:', e);
        }
    }

    // Watch for theme changes
    if (typeof window !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    initCharts();
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
</script>

<div class="container mx-auto px-4 py-8">
    {#if loading}
        <div class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
        </div>
    {:else if error}
        <div class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded relative" role="alert">
            <strong class="font-bold">Error!</strong>
            <span class="block sm:inline">{error}</span>
        </div>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Current Epoch Stats -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 class="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Current Epoch Statistics</h2>
                {#if epochs.length > 0}
                    {@const latest = epochs[epochs.length - 1]}
                    <div class="grid grid-cols-2 gap-4">
                        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg relative">
                            <div class="group absolute top-2 right-2">
                                <button aria-label="Current Price" class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                                <div class="invisible group-hover:visible absolute z-10 w-64 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 rounded-lg shadow-lg p-3 right-0 mt-2 border border-gray-200 dark:border-gray-700">
                                    Volume-weighted average price across all markets
                                </div>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Current Price</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">
                                ${currentPrice ? formatNumber(currentPrice, 6) : '-.--'}
                                {#if priceChange24h}
                                    <span class="text-sm ml-2 {priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'}">
                                        {priceChange24h >= 0 ? '+' : ''}{formatNumber(priceChange24h, 2)}%
                                    </span>
                                {/if}
                            </p>
                        </div>
                        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg relative">
                            <div class="group absolute top-2 right-2">
                                <button aria-label="Current Block Reward APR" class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                                <div class="invisible group-hover:visible absolute z-10 w-64 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 rounded-lg shadow-lg p-3 right-0 mt-2 border border-gray-200 dark:border-gray-700">
                                    Annual Percentage Rate based on current epoch rewards and eligible stake
                                </div>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Current Block Reward APR</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(latest.apr, 2)}%</p>
                        </div>
                        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg relative">
                            <div class="group absolute top-2 right-2">
                                <button aria-label="Current Epoch Reward" class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                                <div class="invisible group-hover:visible absolute z-10 w-64 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 rounded-lg shadow-lg p-3 right-0 mt-2 border border-gray-200 dark:border-gray-700">
                                    Total VOI to be distributed as rewards in the current epoch
                                </div>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Epoch Reward</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(latest.reward)} VOI</p>
                        </div>
                        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg relative">
                            <div class="group absolute top-2 right-2">
                                <button aria-label="Current Online Stake" class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                                <div class="invisible group-hover:visible absolute z-10 w-64 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 rounded-lg shadow-lg p-3 right-0 mt-2 border border-gray-200 dark:border-gray-700">
                                    Total amount of VOI staked in online accounts
                                </div>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Online Stake</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(latest.online_stake / 1_000_000)}M</p>
                        </div>
                        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg relative">
                            <div class="group absolute top-2 right-2">
                                <button aria-label="Current Eligible Stake" class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                                <div class="invisible group-hover:visible absolute z-10 w-64 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 rounded-lg shadow-lg p-3 right-0 mt-2 border border-gray-200 dark:border-gray-700">
                                    Amount of online stake eligible for rewards (excludes ballast and caps Block Authority stake)
                                </div>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Eligible Stake</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(latest.eligible_online_stake / 1_000_000)}M</p>
                        </div>
                        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg relative">
                            <div class="group absolute top-2 right-2">
                                <button aria-label="Current Participating Accounts" class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 transition-colors duration-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                                <div class="invisible group-hover:visible absolute z-10 w-64 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 rounded-lg shadow-lg p-3 right-0 mt-2 border border-gray-200 dark:border-gray-700">
                                    Number of accounts participating in block rewards
                                </div>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Participating Accounts</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{onlineAccountCount !== null ? formatNumber(onlineAccountCount) : '---'}</p>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- APR Chart -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 class="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Block Reward APR Trend</h2>
                <div class="h-[300px] w-full" bind:this={aprChartDiv}></div>
            </div>

            <!-- Price Chart -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Price Trend</h2>
                    <a href="/markets" class="flex items-center text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                        View all markets
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </a>
                </div>
                <div class="h-[300px] w-full" bind:this={priceChartDiv}></div>
            </div>

            <!-- Participating Wallets Chart -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Rewarded Accounts Trend</h2>
                    <a href="/" class="flex items-center text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                        View rewards dashboard
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </a>
                </div>
                <div class="h-[300px] w-full" bind:this={walletsChartDiv}></div>
            </div>

            <!-- Stake Distribution Chart -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 md:col-span-2">
                <h2 class="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Stake Distribution (Millions VOI)</h2>
                <div class="h-[300px] w-full" bind:this={stakeChartDiv}></div>
            </div>
        </div>
    {/if}
</div> 