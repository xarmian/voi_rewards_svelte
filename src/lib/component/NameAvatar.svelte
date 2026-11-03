<script lang="ts">
	let { name, avatar }: { name: string; avatar?: string | null } = $props();
	let broken = $state(false);
	$effect(() => {
		void avatar;
		broken = false;
	});
</script>

<span
	class="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-700 text-xs font-medium text-white"
	data-testid="name-avatar"
>
	{#if avatar && !broken}
		<img src={avatar} alt="" class="h-full w-full object-cover" onerror={() => (broken = true)} />
	{:else}
		{name.charAt(0).toUpperCase()}
	{/if}
</span>
