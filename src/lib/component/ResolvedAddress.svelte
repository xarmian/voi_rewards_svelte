<script lang="ts">
	let { address, label }: { address: string; label?: string } = $props();

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

<div class="flex min-w-0 items-start gap-2 text-sm text-gray-900 dark:text-white">
	{#if label}<span class="shrink-0">{label}</span>{/if}
	<div class="min-w-0 flex-1 font-mono break-all" data-testid="resolved-address" title={address}>
		{address}
	</div>
	<button
		type="button"
		aria-label="Copy address"
		class="shrink-0 text-blue-700 hover:underline dark:text-blue-300"
		onclick={copyAddress}
	>
		Copy
	</button>
</div>
