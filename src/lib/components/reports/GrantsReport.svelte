<script lang="ts">
	import type { GrantsData } from '$lib/types/reports.types';

	let {
		data,
		formatNum
	}: {
		data: GrantsData;
		formatNum: (val: string, prefix?: string) => string;
	} = $props();
</script>

<!-- Monthly Snapshot -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Monthly Snapshot</h3>
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				Total Proposals
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.monthly_snapshot.total_proposals_tracked)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
				New Submissions
			</h3>
			<p class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				{formatNum(data.monthly_snapshot.new_submissions)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Under Review</h3>
			<p class="text-lg sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">
				{formatNum(data.monthly_snapshot.under_review)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Approved</h3>
			<p class="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
				{formatNum(data.monthly_snapshot.approved)}
			</p>
		</div>
		<div
			class="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Funded</h3>
			<p class="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
				{formatNum(data.monthly_snapshot.funded)}
			</p>
		</div>
	</div>
</div>

<!-- Grants Table -->
<div class="mb-6 sm:mb-8">
	<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
		Grants Submitted / In Progress
	</h3>
	{#if data.grants_submitted_in_progress.length > 0}
		<div class="overflow-x-auto">
			<table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
				<thead
					class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400"
				>
					<tr>
						<th scope="col" class="px-4 py-3">Proposal Name</th>
						<th scope="col" class="px-4 py-3">Submitted By</th>
						<th scope="col" class="px-4 py-3">Date</th>
						<th scope="col" class="px-4 py-3">Assigned To</th>
						<th scope="col" class="px-4 py-3">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.grants_submitted_in_progress as grant (grant.proposal_name)}
						<tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
							<td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
								{grant.proposal_name}
							</td>
							<td class="px-4 py-3">{grant.submitted_by}</td>
							<td class="px-4 py-3">{grant.date_submitted}</td>
							<td class="px-4 py-3">{grant.assigned_to}</td>
							<td class="px-4 py-3">
								{#if grant.proposal_status === 'Approved'}
									<span
										class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
									>
										{grant.proposal_status}
									</span>
								{:else if grant.proposal_status === 'Funded'}
									<span
										class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
									>
										{grant.proposal_status}
									</span>
								{:else if grant.proposal_status === 'Under Review'}
									<span
										class="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
									>
										{grant.proposal_status}
									</span>
								{:else}
									<span
										class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
									>
										{grant.proposal_status}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="text-center text-gray-500 dark:text-gray-400 py-8">
			No grant proposals for this period
		</p>
	{/if}
</div>

<!-- Highlights & Notes -->
{#if data.highlights_notes}
	<div class="mb-6 sm:mb-8">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
			Highlights & Notes
		</h3>
		<p class="text-gray-600 dark:text-gray-400 whitespace-pre-line">
			{data.highlights_notes}
		</p>
	</div>
{/if}
