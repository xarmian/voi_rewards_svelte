<script lang="ts">
	import { onMount } from 'svelte';
    import { Chart, Svg, Axis, Bars, Legend } from 'layerchart';
    import { Highlight, Tooltip } from 'layerchart';
    import { scaleBand } from 'd3-scale';
    import { format, PeriodType } from 'svelte-ux';
    import { Spinner } from 'flowbite-svelte';
    import { config } from '../config';
    import { getSupplyInfo, getAccountInfo, getConsensusInfo, onlineStakeStore } from '$lib/stores/accounts';
    import type { Account } from '$lib/stores/accounts';
    export let walletId: string;
    
    let apiData: any;
    $: apiData = null;
    let data: any;
    $: data = [];

    let screenSize: number;
    let idx = 0;

    let supply: any;
    let accountInfo: Account | null = null;
    let expectedBlockTime: string | null = null;
    let historicalExpectedProposals: any = {};

    $: {
        if (apiData && accountInfo?.amount) {
            updateChartData();
        }
    }

    async function fetchOnlineStakeHistory() {
        return await onlineStakeStore.getData();
    }

    async function updateChartData() {
      const chartData = await fetchOnlineStakeHistory();

      // Calculate expected proposals using chartData
      historicalExpectedProposals = {};
      chartData.forEach((dayData: { date: string; avg_online_stake: number }) => {
          if (new Date(dayData.date) < new Date('2024-10-30')) return;
          if (dayData.avg_online_stake) {

              const balance = Number(accountInfo.amount);
              const secondsPerDay = 24 * 60 * 60;
              const blocksPerDay = secondsPerDay / 2.8;
              const expectedBlocks = (balance / dayData.avg_online_stake) * blocksPerDay;
              historicalExpectedProposals[dayData.date] = expectedBlocks;
          }
      });

      data = Object.keys(apiData).map((date) => ({
          date: new Date(date+'T00:00:00'),
          actual: apiData[date].length,
          expected: historicalExpectedProposals[date] ?? 0
      }));

      data.sort((a: {date: Date}, b: {date: Date}) => a.date.getTime() - b.date.getTime());
    }

    const xAxisFormat = (d: Date) => {
            idx++;
            if (screenSize < 768 && (idx-1) % 5 !== 0) {
                return '';
            }
            return format(d, PeriodType.Day, { variant: "short" });
    };

    onMount(async () => {
        const url = `${config.proposalApiBaseUrl}?action=proposals&wallet=${walletId}`;
        try {
            const [response, accountInfoResult, supplyResult] = await Promise.all([
                fetch(url, { cache: 'no-store' }),
                getAccountInfo(walletId),
                getSupplyInfo()
            ]);
            
            apiData = await response.json();
            accountInfo = accountInfoResult ?? null;
            supply = supplyResult;
            
            // Calculate expected block time using current supply
            if (accountInfo?.amount && supply?.['online-money']) {
                const balance = Number(accountInfo?.amount);
                const secondsPerDay = 24 * 60 * 60;
                const blocksPerDay = secondsPerDay / 2.8;
                const dailyBlocks = (balance / Number(supply?.['online-money'] ?? 0)) * blocksPerDay;
                const avgBlockTime = secondsPerDay / dailyBlocks;
                
                const hours = Math.floor(avgBlockTime / (60 * 60));
                const minutes = Math.floor((avgBlockTime % (60 * 60)) / 60);
                expectedBlockTime = `${hours}h ${minutes}m`;
            }
        } catch (error) {
            console.error(error);
        }
    });

    function formatTime(seconds: number) {
        const hours = Math.floor(seconds / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        return `${hours}h ${minutes}m`;
    }

    function calculateAverageBlockTime() {
        if (!accountInfo?.amount || !supply?.['online-money']) return null;
        const balance = Number(accountInfo.amount);
        const secondsPerDay = 24 * 60 * 60;
        const blocksPerDay = secondsPerDay / 2.8; // 2.8 seconds per block
        const dailyBlocks = (balance / supply['online-money']) * blocksPerDay;
        return secondsPerDay / dailyBlocks;
    }

    $: screenSize = window?.innerWidth ?? 1024;
</script>

<svelte:window bind:innerWidth={screenSize} />

<div class="bg-white dark:bg-gray-900 rounded-lg shadow-md w-full">
    <div class="p-6">
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200">Proposals</h3>
            {#if expectedBlockTime}
                <div class="text-sm text-gray-600 dark:text-gray-400">
                    Expected block every: {expectedBlockTime}
                </div>
            {/if}
        </div>
        {#if apiData == null}
            <div class="flex justify-center items-center h-64">
                <Spinner size="16" />
            </div>
        {:else if Object.keys(apiData).length === 0}
            <div class="text-center text-gray-500 dark:text-gray-400 py-8">
                No proposals found in last 30 days
            </div>
        {:else}
            {#if accountInfo?.status !== 'Online'}
              <div class="p-4 mb-4 text-sm text-yellow-800 bg-yellow-50 rounded-lg dark:bg-yellow-900 dark:text-yellow-100">
                <div class="flex items-center mb-2">
                  <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L1 21h22L12 2zm0 3.45l8.4 14.55H3.6L12 5.45z"/>
                    <path d="M11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                  </svg>
                  <span class="font-medium text-base">Important Notice</span>
                </div>
                <div class="ml-7 space-y-2">
                  <p>This account is not participating in consensus. You will not be able to propose or vote on blocks. <a href="/faq#how-do-i-get-started-running-a-node-" class="text-yellow-900 dark:text-yellow-200 underline hover:no-underline">Learn how to get started running a node</a>.</p>
                  <div class="flex items-center pt-1">
                    <span class="font-medium">Account:</span>
                    <span class="ml-2 font-mono bg-yellow-100 dark:bg-yellow-800 px-2 py-0.5 rounded">{walletId}</span>
                  </div>
                </div>
              </div>
            {/if}
            <div class="h-[300px] p-4 border border-gray-200 dark:border-gray-700 rounded">
                <Chart
                {data}
                x="date"
                xScale={scaleBand().padding(0.4)}
                y={["actual", "expected"]}
                yDomain={[0, null]}
                yNice={4}
                padding={{ left: 40, bottom: 40, right: 20, top: 40 }}
                tooltip={{ mode: "band" }}
            >
                        <Legend
                            class="text-sm text-gray-600 dark:text-gray-300 flex flex-row"
                            placement="top-right"
                        >
                            <div class="w-4 h-4 rounded bg-blue-500 dark:bg-blue-400 mr-2"/>
                            <div class="text-gray-600 dark:text-gray-300 mr-4">Actual Proposals</div>
                            <div class="w-4 h-4 rounded bg-green-500 dark:bg-green-400 mr-2"/>
                            <div class="text-gray-600 dark:text-gray-300 mr-2">Expected Proposals</div>
                        </Legend>
                
                <Svg>
                    <Axis 
                        placement="left" 
                        grid 
                        rule={{ class: "stroke-danger" }}
                        tickLabelProps={{
                            class: "fill-gray-600 dark:fill-gray-300 text-sm",
                        }}
                    />
                    <Axis
                        placement="bottom"
                        format={xAxisFormat}
                        rule={{ class: "stroke-gray-200 dark:stroke-gray-700" }}
                        tickLabelProps={{
                            class: "fill-gray-600 dark:fill-gray-300 text-sm",
                            rotate: 315,
                            textAnchor: "end",
                        }}
                    />
                    <Bars 
                        y="actual"
                        radius={4} 
                        strokeWidth={1} 
                        class="fill-blue-500 dark:fill-blue-400 hover:fill-blue-600 dark:hover:fill-blue-500 transition-colors"
                    />
                    <Bars 
                        y="expected"
                        radius={4} 
                        strokeWidth={1} 
                        class="fill-green-500 dark:fill-green-400 hover:fill-green-600 dark:hover:fill-green-500 transition-colors w-2" 
                    />
                    <Highlight area={{ class: "fill-blue-200 dark:fill-blue-400 opacity-30" }} />
                </Svg>
                <Tooltip.Root let:data>
                    <div class="bg-white dark:bg-gray-800 p-2 rounded shadow">
                        <Tooltip.Header class="font-bold text-gray-800 dark:text-gray-200">
                            {format(data.date, PeriodType.Custom, {
                                custom: "eee, MMMM do",
                            })}
                        </Tooltip.Header>
                        <Tooltip.List>
                          <Tooltip.Item 
                            label="Expected Proposals" 
                            value={data.expected.toFixed(0)} 
                            labelClass="text-gray-600 dark:text-gray-300"
                            valueClass="text-green-500 dark:text-green-400 font-semibold"
                          />
                          <Tooltip.Item 
                              label="Actual Proposals" 
                              value={data.actual.toFixed(0)} 
                              labelClass="text-gray-600 dark:text-gray-300"
                              valueClass="text-blue-500 dark:text-blue-400 font-semibold"
                          />
                          <Tooltip.Item 
                            label="Difference" 
                            value={`${data.actual > data.expected ? '+' : ''}${(data.actual - data.expected).toFixed(0)}`} 
                            labelClass="text-gray-600 dark:text-gray-300"
                            valueClass="text-red-500 dark:text-red-400 font-semibold pt-2"
                          />
                        </Tooltip.List>
                    </div>
                </Tooltip.Root>
            </Chart>
        </div>
        {/if}
    </div>
</div>
<style>
</style>

