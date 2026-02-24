<svelte:options runes={false} />

<script lang="ts">
	import { onMount } from 'svelte';
	import { Tabs, TabItem } from 'flowbite-svelte';
	import NetworkReport from './NetworkReport.svelte';
	import GrantsReport from './GrantsReport.svelte';
	import TransparencyReport from './TransparencyReport.svelte';
	import type {
		WeeklyReport,
		ReportPeriod,
		NetworkData,
		GrantsData,
		TransparencyData
	} from '$lib/types/reports.types';

	let reports: WeeklyReport[] = [];
	let periods: ReportPeriod[] = [];
	let selectedPeriodKey = '';
	let isLoading = true;
	let error = '';

	onMount(async () => {
		try {
			const res = await fetch('/api/reports');
			reports = (await res.json()) as WeeklyReport[];

			const seen = new Set<string>();
			const uniquePeriods: ReportPeriod[] = [];

			for (const r of reports) {
				const key = `${r.year}-${r.month}-${r.period}`;
				if (!seen.has(key)) {
					seen.add(key);
					uniquePeriods.push({
						label: `${r.month} ${r.year} (${r.period})`,
						year: r.year,
						month: r.month,
						period: r.period
					});
				}
			}

			periods = uniquePeriods.sort((a, b) => {
				if (a.year !== b.year) return b.year.localeCompare(a.year);
				if (a.month !== b.month) return b.month.localeCompare(a.month);
				return b.period.localeCompare(a.period);
			});

			if (periods.length > 0) {
				selectedPeriodKey = `${periods[0].year}-${periods[0].month}-${periods[0].period}`;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load reports';
		} finally {
			isLoading = false;
		}
	});

	$: filteredReports = reports.filter(
		(r) => `${r.year}-${r.month}-${r.period}` === selectedPeriodKey
	);

	$: networkReport = filteredReports.find((r) => r.category === 'network')?.data as
		| NetworkData
		| undefined;

	$: grantsReport = filteredReports.find((r) => r.category === 'grants')?.data as
		| GrantsData
		| undefined;

	$: transparencyReport = filteredReports.find((r) => r.category === 'transparency')?.data as
		| TransparencyData
		| undefined;

	function formatNum(val: string, prefix = ''): string {
		const num = parseFloat(val);
		if (isNaN(num)) return val;
		if (prefix === '$') return '$' + num.toLocaleString();
		return num.toLocaleString();
	}
</script>

<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 gap-4">
	<h2 class="text-2xl font-bold text-gray-900 dark:text-white">VOI Weekly Reports</h2>

	{#if periods.length > 0}
		<select
			bind:value={selectedPeriodKey}
			class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
		>
			{#each periods as p (p.label)}
				<option value="{p.year}-{p.month}-{p.period}">{p.label}</option>
			{/each}
		</select>
	{/if}
</div>

{#if isLoading}
	<div class="flex justify-center my-8">
		<div
			class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"
		></div>
	</div>
{/if}

{#if error}
	<div
		class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 p-3 sm:p-4 rounded-lg mb-6 sm:mb-8 border border-red-200 dark:border-red-800 text-sm sm:text-base"
	>
		{error}
	</div>
{/if}

{#if !isLoading && !error}
	<Tabs style="underline">
		<TabItem open>
			<div slot="title" class="flex items-center gap-2">
				<i class="fas fa-network-wired"></i>
				<span>Network</span>
			</div>
			{#if networkReport}
				<NetworkReport data={networkReport} {formatNum} />
			{:else}
				<p class="text-gray-500 dark:text-gray-400 py-4">No network data</p>
			{/if}
		</TabItem>
		<TabItem>
			<div slot="title" class="flex items-center gap-2">
				<i class="fas fa-hand-holding-usd"></i>
				<span>Grants</span>
			</div>
			{#if grantsReport}
				<GrantsReport data={grantsReport} {formatNum} />
			{:else}
				<p class="text-gray-500 dark:text-gray-400 py-4">No grants data</p>
			{/if}
		</TabItem>
		<TabItem>
			<div slot="title" class="flex items-center gap-2">
				<i class="fas fa-eye"></i>
				<span>Transparency</span>
			</div>
			{#if transparencyReport}
				<TransparencyReport data={transparencyReport} {formatNum} />
			{:else}
				<p class="text-gray-500 dark:text-gray-400 py-4">No transparency data</p>
			{/if}
		</TabItem>
	</Tabs>

	<p class="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
		Data sourced from <a
			href="https://github.com/fury-05/voiweeklyreports"
			target="_blank"
			rel="noopener noreferrer"
			class="underline hover:text-gray-600 dark:hover:text-gray-300">VOI Weekly Reports</a
		>
	</p>
{/if}
