<script lang="ts">
    import QuestPage from "../QuestsPage.svelte";
    import type { PageData } from './$types';

    export let data: PageData;
    $: projectId = data.props?.projectId ? Number(data.props.projectId) : undefined;
</script>
<QuestPage selectedProjectId={projectId} />