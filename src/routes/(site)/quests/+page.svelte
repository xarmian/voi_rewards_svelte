<script lang="ts">
	import Quests from './QuestsPage.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<Quests projects={data.projects} />
