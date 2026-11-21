<script lang="ts">
	let {
		name,
		avatar,
		size = 'sm'
	}: { name: string; avatar?: string | null; size?: 'sm' | 'md' } = $props();
	const sizeClasses = {
		sm: 'h-6 w-6 text-xs',
		md: 'h-8 w-8 text-base'
	};
	let sizeClass = $derived(sizeClasses[size]);
	let broken = $state(false);
	$effect(() => {
		void avatar;
		broken = false;
	});
</script>

<span
	class="inline-flex {sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-700 font-medium text-white"
	data-testid="name-avatar"
>
	{#if avatar && !broken}
		<img src={avatar} alt="" class="h-full w-full object-cover" onerror={() => (broken = true)} />
	{:else}
		{name.charAt(0).toUpperCase()}
	{/if}
</span>
