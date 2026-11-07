<script lang="ts">
	import { createAvatarImage } from '$lib/wallet/avatarImage.svelte';

	let { gradient, src }: { gradient: string; src: string | null } = $props();
	const image = createAvatarImage(() => src);
</script>

<div
	aria-hidden="true"
	class="relative h-16 w-16 shrink-0 overflow-hidden rounded-ds-md"
	style:background={gradient}
>
	{#key image.src}
		{#if image.src}
			<img
				src={image.src}
				alt=""
				referrerpolicy="no-referrer"
				class="absolute inset-0 h-full w-full object-cover"
				class:opacity-0={!image.show}
				onload={image.onload}
				onerror={image.onerror}
			/>
		{/if}
	{/key}
</div>
