<script lang="ts">
	import { onMount } from 'svelte';
    import { Chart, Svg, Axis, Bars } from 'layerchart';
    import { Highlight, Tooltip } from 'layerchart';
    import { scaleBand } from 'd3-scale';
    import { format, PeriodType } from 'svelte-ux';
    import { Spinner } from 'flowbite-svelte';
    import { config } from '../config';
    import { algodClient } from '$lib/utils/algod';

    export let walletId: string;
    let apiData: any;
    $: apiData = null;
    let data: any;
    $: data = [];

    let screenSize: number;
    let idx = 0;

    let supply: any;
    let accountInfo: any;

    let expectedBlockTime: string | null = null;

    $: {
        if (apiData) {
            // convert apiData to chart format
            data = Object.keys(apiData).map((date) => ({
                date: new Date(date+'T00:00:00'),
                value: apiData[date].length,
            }));

            // sort data by date
            data.sort((a: {date: Date}, b: {date: Date}) => a.date.getTime() - b.date.getTime());
        }
    }

    const xAxisFormat = (d: Date) => {
            idx++;
            if (screenSize < 768 && (idx-1) % 5 !== 0) {
                return '';
            }
            return format(d, PeriodType.Day, { variant: "short" });
    };

    onMount(async () => {
        // get proposal data for walletId
        const url = `${config.proposalApiBaseUrl}?action=proposals&wallet=${walletId}`;
        try {
            const [response, accountInfo, supply] = await Promise.all([
                fetch(url, { cache: 'no-store' }),
                algodClient.accountInformation(walletId).do(),
                algodClient.supply().do()
            ]);
            
            apiData = await response.json();
            
            // Calculate expected block time once
            if (accountInfo?.amount && supply?.['online-money']) {
                const balance = Number(accountInfo.amount);
                const secondsPerDay = 24 * 60 * 60;
                const blocksPerDay = secondsPerDay / 2.8;
                const dailyBlocks = (balance / supply['online-money']) * blocksPerDay;
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

</script>

<div class="p-6 bg-white dark:bg-gray-900 rounded-lg shadow-md">
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
    <div class="h-[300px] p-4 border border-gray-200 dark:border-gray-700 rounded">
        <Chart
          {data}
          x="date"
          xScale={scaleBand().padding(0.4)}
          y="value"
          yDomain={[0, null]}
          yNice={4}
          padding={{ left: 40, bottom: 40, right: 20, top: 20 }}
          tooltip={{ mode: "band" }}
        >
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
              radius={4} 
              strokeWidth={1} 
              class="fill-blue-500 dark:fill-blue-400 hover:fill-blue-600 dark:hover:fill-blue-500 transition-colors" 
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
                  label="Proposals" 
                  value={data.value} 
                  labelClass="text-gray-600 dark:text-gray-300"
                  valueClass="text-gray-800 dark:text-gray-100 font-semibold"
                />
              </Tooltip.List>
            </div>
          </Tooltip.Root>
        </Chart>
      </div>
    {/if}
</div>
<style>
</style>

