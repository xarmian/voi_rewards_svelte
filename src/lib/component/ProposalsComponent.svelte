<script lang="ts">
	import { onMount } from 'svelte';
    import { Chart, Svg, Axis, Bars } from 'layerchart';
    import { Highlight, RectClipPath, Tooltip, TooltipItem } from 'layerchart';
    // @ts-ignore
    import { scaleBand } from 'd3-scale';
    import { formatDate, PeriodType } from 'svelte-ux';
    import { format } from 'date-fns';

    export let walletId: string;
    let apiData: any;
    $: apiData = null;
    let data: any;
    $: data = [];

    onMount(async () => {
        // get proposal data for walletId
        const url = `https://socksfirstgames.com/proposers/index_v2.php?action=proposals&wallet=${walletId}`;
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

<div>
    {#if apiData == null}
        <div>Loading Chart...</div>
    {:else if apiData.length == 0}
        <div>No proposals found in last 30 days</div>
    {:else}
        <div class="h-[300px] p-4 border rounded group">
            <Chart
            {data}
            x="date"
            xScale={scaleBand().padding(0.4)}
            y="value"
            yDomain={[0, null]}
            yNice
            padding={{ left: 16, bottom: 24 }}
            tooltip={{ mode: "band" }}
          >
            <Svg>
              <Axis placement="left" grid rule />
              <Axis
                placement="bottom"
                format={(d) => formatDate(d, PeriodType.Day, "short")}
                rule
              />
              <Bars
                radius={4}
                strokeWidth={1}
                class="fill-accent-500 group-hover:fill-gray-300 transition-colors"
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
                    <Bars radius={4} strokeWidth={1} class="fill-accent-500" />
                  </RectClipPath>
                </svelte:fragment>
              </Highlight>
            </Svg>
            <Tooltip header={(data) => format(data.date, "eee, MMMM do")} let:data>
              <TooltipItem label="value" value={data.value} />
            </Tooltip>
          </Chart>
        </div>
    {/if}
</div>
<style>
</style>

