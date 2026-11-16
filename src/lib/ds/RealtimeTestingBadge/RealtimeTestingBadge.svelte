<script lang="ts">
	import StatusPill from '../StatusPill/StatusPill.svelte';
	import { REALTIME_BLOCK_REWARDS_TESTING } from '$lib/rewards/blockRewardLabels';
</script>

{#if REALTIME_BLOCK_REWARDS_TESTING}<StatusPill tone="info" label="Testing" />{/if}
