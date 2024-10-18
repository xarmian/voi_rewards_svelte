<script lang="ts">
  import { Chart, Svg, Axis, Bars } from 'layerchart';
  import { scaleTime, scaleLinear } from 'd3-scale';
  import { extent, max } from 'd3-array';
  import { format, PeriodType } from 'svelte-ux';
  import { scaleBand } from 'd3-scale';
  
  export let chartData: Array<{ timestamp: string; online_stake: number }>;

  $: data = chartData
    .filter(d => d.online_stake !== null)
    .map(d => ({
      x: new Date(d.timestamp),
      y: d.online_stake / 1e6
    }));

  $: xScale = scaleTime()
    .domain(extent(data, d => d.x) as [Date, Date]);

  $: yScale = scaleLinear()
    .domain([0, max(data, d => d.y) as number]);

  const xAxisFormat = (d: Date) => format(d, PeriodType.Day, { variant: "short" });
  const yAxisFormat = (d: number) => `${(d / 1e6).toFixed(0)}M`;
</script>

<div class="chart-container">
  <Chart
    {data}
    x="x"
    y="y"
    xScale={scaleBand().padding(0.4)}
    yDomain={[0, null]}
    yNice={4}
    padding={{ left: 40, bottom: 20, right: 10, top: 10 }}
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
    </Svg>
  </Chart>
</div>

<style>
  .chart-container {
    height: 100px;
    width: 100%;
  }
</style>
