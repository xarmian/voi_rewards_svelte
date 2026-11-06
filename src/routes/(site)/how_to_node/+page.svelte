<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Card, Chip, SearchBox } from '$lib/ds';
	import { guideGroups } from './guides';
	import type { PageData } from './$types';

	let { data }: { data: Pick<PageData, 'faqHighlights'> } = $props();
</script>

{#snippet guideGroup(group: (typeof guideGroups)[number])}
	<Card title={group.heading}>
		{#if group.subheading}
			<p class="mb-4 text-body text-ink-muted">{group.subheading}</p>
		{/if}
		<ul class="space-y-4">
			{#each group.links as link}
				<li>
					<a
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						class="text-accent underline underline-offset-4"
					>
						{#each link.text.split('*') as text, i}{#if i % 2 === 0}{text}{:else}<strong
									>{text}</strong
								>{/if}{/each}<span class="sr-only">{' (opens in a new tab)'}</span>
					</a>
				</li>
			{/each}
		</ul>
	</Card>
{/snippet}

<div class="container-page space-y-8 py-8 text-ink break-words md:py-12">
	<header class="max-w-3xl">
		<h1 class="text-display">Run a node</h1>
		<p class="mt-4 text-lede">Set up. Estimate. Check.</p>
		<p class="mt-4 text-body text-ink-muted">
			Node Runners earn block rewards for each block they propose. Block proposals are a key part of
			the Voi consensus mechanism.
		</p>
	</header>

	<ol aria-label="Run a node in three steps" class="grid gap-bento lg:grid-cols-3">
		<li class="min-w-0">
			<Card>
				<Chip label="1" />
				<h2 class="mt-3 text-h2">Read a guide</h2>
				<p class="mt-3 text-body text-ink-muted">
					Choose a setup guide for your system and get your node online.
				</p>
				<Button href="#guides" variant="soft" class="mt-4">Browse setup guides</Button>
			</Card>
		</li>
		<li class="min-w-0">
			<Card>
				<Chip label="2" />
				<h2 class="mt-3 text-h2">Estimate rewards</h2>
				<p class="mt-3 text-body text-ink-muted">
					Explore potential block rewards for the amount you plan to stake.
				</p>
				<Button href="/calculator" variant="soft" class="mt-4">Open rewards calculator</Button>
			</Card>
		</li>
		<li class="min-w-0">
			<Card>
				<Chip label="3" />
				<h2 class="mt-3 text-h2">Check it's working</h2>
				<p class="mt-3 text-body text-ink-muted">
					Look up your node's wallet to check its status and rewards.
				</p>
				<Button href="#wallet-check" variant="soft" class="mt-4">Check your wallet</Button>
			</Card>
		</li>
	</ol>

	<section id="guides" aria-label="Node guides and support" class="grid gap-bento lg:grid-cols-12">
		<div class="min-w-0 space-y-6 lg:col-span-8">
			{#each guideGroups.slice(0, 2) as group}
				{@render guideGroup(group)}
			{/each}
		</div>
		<aside class="min-w-0 lg:col-span-4">
			{@render guideGroup(guideGroups[2])}
		</aside>
	</section>

	<section id="wallet-check" aria-labelledby="node-wallet-heading">
		<Card title="Check your node's wallet" id="node-wallet-heading" as="div">
			<p class="mb-4 max-w-3xl text-body text-ink-muted">
				Enter a wallet address or an enVoi name to check your node. For a locked stake, use the
				contract account.
			</p>
			<div class="max-w-3xl">
				<SearchBox
					variant="hero"
					tone="surface"
					collapsible={false}
					id="node-wallet-check"
					formLabel="Node wallet check"
					onsubmit={(address) => void goto('/wallet/' + address)}
				/>
			</div>
		</Card>
	</section>

	<Card title="Node questions">
		<div class="divide-y divide-line">
			{#each data.faqHighlights as highlight}
				<details class="py-4 first:pt-0">
					<summary class="cursor-pointer text-body font-bold">
						{#each highlight.question.split('**') as text, i}{#if i % 2 === 0}{text}{:else}<strong
									>{text}</strong
								>{/if}{/each}
					</summary>
					<p class="mt-3 max-w-3xl text-body text-ink-muted">{highlight.excerpt}</p>
					<a
						href={`/faq#${highlight.slug}`}
						class="mt-3 inline-block text-accent underline underline-offset-4"
						>Read the full answer</a
					>
				</details>
			{/each}
		</div>
		<a href="/faq" class="inline-block text-accent underline underline-offset-4"
			>See all questions</a
		>
	</Card>

	<Card title="Tools">
		<p class="text-accent underline underline-offset-4">
			<a href="/vanity" data-sveltekit-reload>Vanity address generator</a>
		</p>
	</Card>
</div>
