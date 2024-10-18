<script lang="ts">
  import { Chart, Svg, Axis, Bars } from 'layerchart';
  import { Highlight, Tooltip } from 'layerchart';
  import { format, PeriodType } from 'svelte-ux';
  import { scaleBand, scaleLinear } from 'd3-scale';
  import { format as fnsFormat } from 'date-fns';

  export let chartData: Array<{ date: string; avg_online_stake: number; max_timestamp: string }>;

  const xScale = scaleBand().padding(0.4);

  $: data = chartData
    .filter(d => d.avg_online_stake !== null)
    .map(d => ({
      x: new Date(d.date + 'T00:00:00'),
      y: d.avg_online_stake / 1e6
    }));

  const xAxisFormat = (date: Date) => fnsFormat(date, 'MMM d');
  const yAxisFormat = (d: number) => `${(d / 1e6).toFixed(0)}M`;
</script>

<div class="h-[400px] max-h-svh w-full">
  <Chart
    {data}
    x="x"
    y="y"
    xScale={xScale}
    yDomain={[0, null]}
    yNice={4}
    padding={{ left: 40, bottom: 20, right: 10, top: 10 }}
    tooltip={{ mode: "band" }}
  >
    <Svg>
      <Axis 
        placement="left" 
        format={yAxisFormat}
        tickLabelProps={{
          class: "fill-gray-600 dark:fill-gray-300 text-xs",
        }}
      />
      <Axis
        placement="bottom"
        format={xAxisFormat}
        tickLabelProps={{
          class: "fill-gray-600 dark:fill-gray-300 text-xs",
          rotate: 315,
          textAnchor: "end",
        }}
      />
      <Bars 
        x="x"
        y="y"
        fill="#6366f1"
        opacity={0.8}
      />
      <Highlight area={{ class: "fill-blue-200 dark:fill-blue-400 opacity-30" }} />
    </Svg>
    <Tooltip.Root let:data>
      <div class="bg-white dark:bg-gray-800 p-2 rounded shadow">
        <Tooltip.Header class="font-bold text-gray-800 dark:text-gray-200">
          {format(data.x, PeriodType.Custom, {
            custom: "eee, MMMM do",
          })}
        </Tooltip.Header>
        <Tooltip.List>
          <Tooltip.Item 
            label="Stake" 
            value={data.y.toLocaleString()} 
            labelClass="text-gray-600 dark:text-gray-300"
            valueClass="text-gray-800 dark:text-gray-100 font-semibold"
          />
        </Tooltip.List>
      </div>
    </Tooltip.Root>
</Chart>
</div>
