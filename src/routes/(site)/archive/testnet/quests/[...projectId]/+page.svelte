<script lang="ts">
	import { ArchiveBanner } from '$lib/ds';
	import QuestPage from '../QuestsPage.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	$: projectId = data.props?.projectId ? Number(data.props.projectId) : undefined;
</script>

<ArchiveBanner programme="Phase 2 quests" />

<QuestPage selectedProjectId={projectId} projects={data.projects} />
