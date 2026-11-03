<script lang="ts">
	let {
		address,
		name = null,
		label
	}: { address: string; name?: string | null; label?: string } = $props();

	async function copyAddress() {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(address);
			} catch {
				// Clipboard access may be denied by the browser.
			}
		}
	}
</script>

<div class="min-w-0 space-y-1 text-sm text-gray-900 dark:text-white">
	{#if label}<span>{label}</span>{/if}
	{#if name}<div>{name}</div>{/if}
	<div class="font-mono break-all" data-testid="resolved-address" title={address}>{address}</div>
	<button
		type="button"
		aria-label="Copy address"
		class="text-blue-700 hover:underline dark:text-blue-300"
		onclick={copyAddress}
	>
		Copy
	</button>
</div>
