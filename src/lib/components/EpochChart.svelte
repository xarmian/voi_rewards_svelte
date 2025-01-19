<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import * as echarts from 'echarts';
    import type { EChartsOption } from 'echarts';

    export let mergedData: any[] = [];
    
    let chartDiv: HTMLElement;
    let chart: echarts.ECharts;

    $: if (chartDiv && browser && mergedData.length > 0) {
        updateChart();
    }

    function formatDate(date: Date): string {
        return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric'
        });
    }

    function updateChart() {
        if (!chart || !mergedData.length || !browser) return;

        const isDarkMode = document.documentElement.classList.contains('dark');
        const textColor = isDarkMode ? '#9CA3AF' : '#4B5563';
        const gridColor = isDarkMode ? '#374151' : '#E5E7EB';
        const backgroundColor = 'transparent';

        // Sort data chronologically (oldest to newest)
        const sortedData = [...mergedData].sort((a, b) => a.epoch - b.epoch);

        // Prepare data for the chart
        const chartData = sortedData.map(d => ({
            date: `${formatDate(d.startDate)} - ${formatDate(d.endDate)}`,
            value: d.actualReward || d.expectedReward,
            isEstimate: !d.actualReward,
            epoch: d.epoch,
            userBlocksProduced: d.userBlocksProduced,
            totalBlocksProduced: d.totalBlocksProduced,
            actualReward: d.actualReward,
            expectedReward: d.expectedReward
        }));

        const options: EChartsOption = {
            backgroundColor,
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'line'
                },
                backgroundColor: isDarkMode ? '#1F2937' : 'white',
                borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                textStyle: {
                    color: textColor
                },
                formatter: (params: any) => {
                    if (!Array.isArray(params)) return '';
                    const data = params[0].data;
                    return `
                        <div class="font-bold">Epoch ${data.epoch}</div>
                        <div>Blocks: ${data.userBlocksProduced} / ${data.totalBlocksProduced}</div>
                        ${data.actualReward 
                            ? `<div>Actual: ${data.actualReward.toFixed(2)} VOI</div>`
                            : `<div>Estimate: ${data.expectedReward.toFixed(2)} VOI</div>`
                        }
                    `;
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '100',
                top: '40',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: chartData.map(d => d.date),
                axisLabel: {
                    color: textColor,
                    rotate: 45,
                    interval: 0
                },
                axisLine: {
                    lineStyle: { color: gridColor }
                }
            },
            yAxis: {
                type: 'value',
                name: 'VOI',
                nameLocation: 'middle',
                nameGap: 50,
                axisLabel: {
                    color: textColor,
                    formatter: '{value} VOI'
                },
                axisLine: {
                    lineStyle: { color: gridColor }
                },
                splitLine: {
                    lineStyle: { color: gridColor }
                }
            },
            series: [
                {
                    name: 'Rewards',
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    data: chartData.map(d => ({
                        ...d,
                        itemStyle: {
                            color: d.isEstimate 
                                ? (isDarkMode ? '#9CA3AF' : '#6B7280') // Gray for estimates
                                : (isDarkMode ? '#60A5FA' : '#3B82F6')  // Blue for actuals
                        }
                    })),
                    lineStyle: {
                        width: 3,
                        color: isDarkMode ? '#60A5FA' : '#3B82F6'
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            {
                                offset: 0,
                                color: isDarkMode ? 'rgba(96, 165, 250, 0.2)' : 'rgba(59, 130, 246, 0.2)'
                            },
                            {
                                offset: 1,
                                color: isDarkMode ? 'rgba(96, 165, 250, 0)' : 'rgba(59, 130, 246, 0)'
                            }
                        ])
                    }
                }
            ]
        };

        chart.setOption(options);
    }

    onMount(() => {
        if (!chartDiv || !browser) return;
        
        chart = echarts.init(chartDiv);
        
        const resizeObserver = new ResizeObserver(() => {
            chart.resize();
        });
        
        resizeObserver.observe(chartDiv);

        // Watch for theme changes
        const observer = new MutationObserver(() => {
            updateChart();
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        return () => {
            resizeObserver.disconnect();
            observer.disconnect();
            chart.dispose();
        };
    });
</script>

<div class="w-full h-[500px]" bind:this={chartDiv}></div> 