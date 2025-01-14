<!-- PriceChart.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { createChart, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';

    export let data: LineData[] = [];
    export let height = 400;
    export let selectedMarket: {
        exchange: string;
        pair: string;
        trading_pair_id: number;
    } | null = null;

    let chartContainer: HTMLElement;
    let chart: IChartApi;
    let series: ISeriesApi<'Line'>;
    let isDarkMode = false;

    // Time period selection
    export let selectedPeriod: '24h' | '7d';
    export let onPeriodChange: (period: '24h' | '7d') => void;

    const periods = [
        { value: '24h', label: '24H' },
        { value: '7d', label: '7D' },
    ];

    function formatTimeByPeriod(timestamp: number, period: '24h' | '7d'): string {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

        if (period === '24h') {
            // For 24h view, show HH:MM
            return date.toLocaleTimeString(undefined, { 
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } else {
            // For 7d view, show MMM DD HH:MM
            if (hoursDiff < 24) {
                return date.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } else {
                return date.toLocaleString(undefined, {
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            }
        }
    }

    // Watch for theme changes
    function updateChartTheme() {
        if (!chart) return;
        
        isDarkMode = document.documentElement.classList.contains('dark');
        const gridColor = isDarkMode ? '#2D3748' : '#E5E7EB';
        const textColor = isDarkMode ? '#9CA3AF' : '#4B5563';
        
        chart.applyOptions({
            layout: {
                background: { color: 'transparent' },
                textColor: textColor,
            },
            grid: {
                vertLines: { color: gridColor },
                horzLines: { color: gridColor },
            },
            rightPriceScale: {
                borderColor: gridColor,
                scaleMargins: {
                    top: 0.2,
                    bottom: 0.2,
                },
                mode: 1,
            },
            timeScale: {
                borderColor: gridColor,
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: (time: number) => {
                    return formatTimeByPeriod(time, selectedPeriod);
                },
            },
        });
    }

    onMount(() => {
        chart = createChart(chartContainer, {
            height,
            width: chartContainer.clientWidth,
            autoSize: false,
            layout: {
                background: { color: 'transparent' },
                textColor: '#4B5563',
            },
            grid: {
                vertLines: { color: '#E5E7EB' },
                horzLines: { color: '#E5E7EB' },
            },
            rightPriceScale: {
                borderColor: '#E5E7EB',
                scaleMargins: {
                    top: 0.2,
                    bottom: 0.2,
                },
                mode: 1,
            },
            timeScale: {
                borderColor: '#E5E7EB',
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: (time: number) => {
                    return formatTimeByPeriod(time, selectedPeriod);
                },
            },
            localization: {
                timeFormatter: (time: number) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleString();
                },
            },
            crosshair: {
                mode: 0,
            },
        });

        series = chart.addLineSeries({
            color: '#8B5CF6',
            lineWidth: 2,
            crosshairMarkerVisible: true,
            lastValueVisible: true,
            priceLineVisible: true,
        });

        series.applyOptions({
            priceFormat: {
                type: 'price',
                precision: 6,
                minMove: 0.000001,
            },
        });

        series.setData(data);

        // Set up theme observer
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    updateChartTheme();
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        // Initial theme setup
        updateChartTheme();

        // Handle window resize
        const handleResize = () => {
            if (chartContainer && chart) {
                chart.applyOptions({ 
                    width: chartContainer.clientWidth 
                });
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    });

    onDestroy(() => {
        if (chart) {
            chart.remove();
        }
    });

    $: if (series && data) {
        series.setData(data);
    }
</script>

<div class="flex flex-col gap-4 w-full">
    <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Price Chart 
            {#if selectedMarket}
                - {selectedMarket.exchange} {selectedMarket.pair}
            {:else}
                - All Markets Aggregated
            {/if}
        </h3>
        <div class="flex gap-2">
            {#each periods as period}
                <button
                    class="px-3 py-1 text-sm rounded-lg transition-colors
                        {selectedPeriod === period.value
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                    on:click={() => onPeriodChange(period.value as '24h' | '7d')}
                >
                    {period.label}
                </button>
            {/each}
        </div>
    </div>
    <div class="w-full" bind:this={chartContainer}></div>
</div>

<style>
    /* Chart styles */
</style> 