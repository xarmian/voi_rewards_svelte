<script lang="ts">
	import { Card } from '$lib/ds';
	const links = [
		{ href: '/how_to_node', title: 'Setup guides', detail: 'Pick a guide for your platform' },
		{ href: '/calculator', title: 'Rewards calculator', detail: 'What will my stake earn?' },
		{ href: '/faq', title: 'FAQ', detail: 'Keys, lock contracts, payouts' }
	];
</script>

<Card title="Run a node">
	<ul>
		{#each links as link, index (link.href)}
			<li class="border-b border-line last:border-b-0">
				<a href={link.href} class="flex min-h-11 items-center gap-3 py-3 text-sm text-ink">
					<span
						aria-hidden="true"
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-ds-xs bg-accent-soft text-accent"
						>{index + 1}</span
					>
					<span
						><span class="block font-bold">{link.title}</span><span
							class="block text-label text-ink-muted">{link.detail}</span
						></span
					>
				</a>
			</li>
		{/each}
	</ul>
</Card>
