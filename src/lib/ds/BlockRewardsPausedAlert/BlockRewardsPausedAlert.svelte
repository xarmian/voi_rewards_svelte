<script lang="ts">
	import InlineAlert from '../InlineAlert/InlineAlert.svelte';
	import { BLOCK_REWARDS_PAUSED_TEXT } from '$lib/rewards/blockRewardStatus';
</script>

<InlineAlert tone="warn" message={BLOCK_REWARDS_PAUSED_TEXT} />
