<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/ds';
	import { shortAddr } from '$lib/ds/format';
	import { nicknames } from '$lib/stores/nicknames';
	let { address, onclose }: { address: string | null; onclose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let returnFocus: HTMLElement | null = null;
	$effect(() => {
		if (address !== null && dialog && !dialog.open) {
			// RowMenu restores its trigger synchronously before this effect opens the dialog.
			untrack(() => {
				returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				dialog.showModal();
			});
		} else if (address === null && dialog?.open) dialog.close();
	});
	function close() {
		dialog.close();
	}
	function closed() {
		onclose();
		returnFocus?.focus();
		returnFocus = null;
	}
	function save(event: SubmitEvent) {
		event.preventDefault();
		if (address)
			nicknames.setNickname(
				address,
				String(new FormData(event.currentTarget as HTMLFormElement).get('nickname') ?? '').trim()
			);
		close();
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="nickname-title"
	onclose={closed}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	class="w-full max-w-sm rounded-card border border-line bg-surface p-card text-ink shadow-pop"
>
	{#key address}
		<form onsubmit={save} class="space-y-4">
			<h2 id="nickname-title" class="text-h2">Nickname for {shortAddr(address)}</h2>
			<label class="block text-label" for="nickname-value">Nickname</label>
			<input
				id="nickname-value"
				name="nickname"
				type="text"
				value={address ? ($nicknames[address] ?? '') : ''}
				class="min-h-11 w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-3 text-sm text-ink"
			/>
			<div class="flex flex-wrap gap-2">
				<Button type="submit" variant="soft">Save</Button>
				{#if address && $nicknames[address]}
					<Button
						variant="ghost"
						onclick={() => {
							if (address) nicknames.removeNickname(address);
							close();
						}}>Remove</Button
					>
				{/if}
				<Button variant="ghost" onclick={close}>Cancel</Button>
			</div>
		</form>
	{/key}
</dialog>
