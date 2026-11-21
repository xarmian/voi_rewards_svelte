<script lang="ts">
	import { Button, Card, Chip, DataTable, type Column } from '$lib/ds';
	import { epochScheduleAmounts } from './inputs';
	import { buildScheduleCsv, type ScheduleRow } from './schedule';
	import { EPOCH_START_DATE, type EpochCalculator } from './state.svelte';

	// The calculator's reward schedule card and its CSV, moved here unchanged.
	let { calc }: { calc: EpochCalculator } = $props();

	let isRewardScheduleVisible = $state(false);
	let isPastEpochsVisible = $state(false);
	let isDownloadingCSV = $state(false);
	let visibleRows = $derived(
		isPastEpochsVisible
			? [...calc.state.pastEpochSchedule, ...calc.state.epochSchedule]
			: calc.state.epochSchedule
	);

	function loadData() {
		return calc.reload();
	}

	function formatDate(date: Date): string {
		return (
			date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC'
			}) + ' UTC'
		);
	}

	async function downloadEpochScheduleCSV() {
		isDownloadingCSV = true;
		try {
			const amounts = await epochScheduleAmounts();
			const csvContent = buildScheduleCsv(amounts, EPOCH_START_DATE);
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute(
				'download',
				`epoch-schedule-${EPOCH_START_DATE.toISOString().split('T')[0]}.csv`
			);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Error generating CSV:', error);
			alert('Failed to generate CSV. Please try again.');
		} finally {
			isDownloadingCSV = false;
		}
	}
</script>

{#snippet epochCell(row: ScheduleRow)}
	<div class="flex flex-wrap items-center gap-2">
		<span>{row.epochNumber + 1}</span>
		{#if row.isCurrent}<Chip label="Current" />{/if}
	</div>
{/snippet}
{#snippet dateCell(row: ScheduleRow)}
	<span class="whitespace-normal">{formatDate(row.startDate)} - {formatDate(row.endDate)}</span>
{/snippet}
{#snippet poolCell(row: ScheduleRow)}
	<span class="break-words"
		>{row.rewardPool.toLocaleString(undefined, { maximumFractionDigits: 0 })} VOI</span
	>
{/snippet}

<Card>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<Button
			variant="ghost"
			aria-expanded={isRewardScheduleVisible}
			aria-controls="reward-schedule"
			onclick={() => (isRewardScheduleVisible = !isRewardScheduleVisible)}
			>{isRewardScheduleVisible ? '▴' : '▾'} View Reward Schedule</Button
		>
		<Button
			variant="soft"
			disabled={isDownloadingCSV}
			onclick={() => void downloadEpochScheduleCSV()}
			>{isDownloadingCSV ? 'Generating...' : 'Download CSV'}</Button
		>
	</div>
	<div id="reward-schedule" hidden={!isRewardScheduleVisible} class="mt-4 min-w-0">
		{#if calc.state.pastEpochSchedule.length > 0}<Button
				variant="ghost"
				size="sm"
				aria-pressed={isPastEpochsVisible}
				onclick={() => (isPastEpochsVisible = !isPastEpochsVisible)}>Previous epochs</Button
			>{/if}
		<DataTable
			columns={[
				{ key: 'epochNumber', header: 'Epoch', priority: 1, cell: epochCell },
				{ key: 'dates', header: 'Date range', priority: 2, cell: dateCell },
				{ key: 'rewardPool', header: 'Reward pool', priority: 1, numeric: true, cell: poolCell }
			] satisfies Column<ScheduleRow>[]}
			rows={visibleRows}
			rowKey={(row) => String(row.epochNumber)}
			caption="Epoch reward schedule"
			density="compact"
			expandable
			rowName={(row) => `epoch ${row.epochNumber + 1}`}
			state={calc.state.isLoading
				? 'loading'
				: calc.state.loadError || !calc.state.epochSchedule.length
					? 'error'
					: 'ready'}
			onretry={() => void loadData()}
		/>
	</div>
</Card>
