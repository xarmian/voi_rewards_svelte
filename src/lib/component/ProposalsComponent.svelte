<script lang="ts">
	import { onMount } from 'svelte';
    import { Chart, Svg, Axis, Bars } from 'layerchart';
    import { Highlight, RectClipPath, Tooltip, TooltipItem } from 'layerchart';
    // @ts-ignore
    import { scaleBand } from 'd3-scale';
    import { formatDate, PeriodType } from 'svelte-ux';
    import { format } from 'date-fns';
    import { Spinner } from 'flowbite-svelte';
    import { config } from '../config';
    export let walletId: string;
    let apiData: any;
    $: apiData = null;
    let data: any;
    $: data = [];

    onMount(async () => {
        // get proposal data for walletId
        const url = `${config.proposalApiBaseUrl}?action=proposals&wallet=${walletId}`;
        await fetch(url, { cache: 'no-store' })
            .then((response) => response.json())
            .then((data) => {
                apiData = data;
            })
            .catch((error) => {
                console.error(error);
            });
    });

    $: {
        if (apiData) {
            // convert apiData to chart format
            data = Object.keys(apiData).map((date) => {
                return {
                    date: new Date(date+'T00:00:00'),
                    value: apiData[date].length,
                };
            });
        }
    }
</script>

<div class="p-6 bg-white dark:bg-gray-900 rounded-lg shadow-md">
    <h3 class="text-xl font-bold mb-6 text-gray-800 dark:text-gray-200">Proposals</h3>
    {#if apiData == null}
        <div class="flex justify-center items-center h-64">
            <Spinner size="16" />
        </div>
    {:else if apiData.length == 0}
        <div class="text-center text-gray-500 dark:text-gray-400 py-8">
            No proposals found in last 30 days
        </div>
    {:else}
        <div class="h-[300px]">
            <Chart
                {data}
                x="date"
                xScale={scaleBand().padding(0.4)}
                y="value"
                yDomain={[0, null]}
                yNice
                padding={{ left: 40, bottom: 40, right: 20, top: 20 }}
                tooltip={{ mode: "band" }}
            >
                <Svg>
                    <Axis placement="left" grid rule 
                    labelProps={{
                        class: "text-sm font-light",
                    }}
                    />
                    <Axis
                        placement="bottom"
                        rule
                        format={(d) => formatDate(d, PeriodType.Day, "short")}
                        labelProps={{
                            rotate: 315,
                            textAnchor: "end",
                            class: "text-sm font-light",
                        }}
                    />
                    <Bars
                        radius={4}
                        strokeWidth={1}
                        class="fill-blue-500 hover:fill-blue-600 transition-colors"
                    />
                    <Highlight area>
                        <svelte:fragment slot="area" let:area>
                            <RectClipPath
                                x={area.x}
                                y={area.y}
                                width={area.width}
                                height={area.height}
                                spring
                            >
                                <Bars radius={4} strokeWidth={1} class="fill-blue-600" />
                            </RectClipPath>
                        </svelte:fragment>
                    </Highlight>
                </Svg>
                <Tooltip header={(data) => format(data.date, "EEEE, MMMM do")} let:data>
                    <TooltipItem label="Proposals" value={data.value} class="text-gray-800 dark:text-gray-200" />
                </Tooltip>
            </Chart>
        </div>
    {/if}
</div>
<style>
</style>

