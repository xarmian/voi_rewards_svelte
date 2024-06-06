<script lang="ts">
    import Dashboard from './Dashboard.svelte';
    import Quests from './quests/Quests.svelte';
    import { onMount } from 'svelte';

    let page: null | string = null;

    onMount(async () => {
        const url = window.location.href;

        if (url.includes('quests.voirewards.com')) {
            page = 'quests';
        }
        else {
            page = 'dashboard';
        }
    });
</script>
{#if page === 'quests'}
    <Quests />
{:else if page === 'dashboard'}
    <Dashboard />
{/if}
