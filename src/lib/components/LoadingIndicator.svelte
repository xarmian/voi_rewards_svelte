<script lang="ts">
    import { isLoading } from '$lib/stores/loadingStore';
</script>

{#if $isLoading}
    <div class="fixed top-0 left-0 right-0 z-50 h-1 bg-blue-500 animate-pulse"></div>
{/if}

<style>
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    .animate-pulse {
        animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
</style>