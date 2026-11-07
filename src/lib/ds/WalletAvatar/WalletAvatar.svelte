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
	{#key image.generation}
		{#if image.src}
			<img
				src={image.src}
				alt=""
				referrerpolicy="no-referrer"
				decoding="async"
				data-generation={image.generation}
				class="absolute inset-0 h-full w-full object-cover"
				class:opacity-0={!image.show}
				onload={(event) => image.onload(Number(event.currentTarget.dataset.generation))}
				onerror={(event) => image.onerror(Number(event.currentTarget.dataset.generation))}
			/>
		{/if}
	{/key}
</div>
