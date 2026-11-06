<script lang="ts">
	import { ArchiveBanner } from '$lib/ds';
	import WeeklyReports from '$lib/components/reports/WeeklyReports.svelte';
</script>

<ArchiveBanner programme="Weekly reports" />

<div class="py-8">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<WeeklyReports />
	</div>
</div>
