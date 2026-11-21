<script lang="ts">
	import { ArchiveBanner } from '$lib/ds/ArchiveBanner';
	import Quests from './QuestsPage.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<ArchiveBanner programme="Phase 2 quests" />

<Quests projects={data.projects} />
