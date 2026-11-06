<svelte:options runes={true} />

<script lang="ts">
	import { Card } from '$lib/ds';
</script>

<svelte:head>
	<title>Testnet archive | Voi</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 px-4 py-8 text-ink">
	<h1 class="text-title">Testnet archive</h1>
	<p>These programmes have ended. The archived pages are read-only.</p>
	<ul class="grid gap-4 md:grid-cols-2">
		<li>
			<Card>
				<a class="text-accent underline" href="/archive/testnet/phase1">Phase 1 rewards</a>
				<p class="mt-2 text-ink-muted">Phase 1 Snapshot</p>
			</Card>
		</li>
		<li>
			<Card>
				<a class="text-accent underline" href="/archive/testnet/phase2">Phase 2 rewards</a>
				<p class="mt-2 text-ink-muted">Your Phase 2 Estimated Rewards</p>
			</Card>
		</li>
		<li>
			<Card>
				<a class="text-accent underline" href="/archive/testnet/leaderboard">Leaderboard</a>
				<p class="mt-2 text-ink-muted">Testnet Phase 2 Quest Leaderboard</p>
			</Card>
		</li>
		<li>
			<Card>
				<a class="text-accent underline" href="/archive/testnet/quests">Quests</a>
				<p class="mt-2 text-ink-muted">Get Your Quest On</p>
			</Card>
		</li>
		<li>
			<Card>
				<a class="text-accent underline" href="/archive/testnet/reports">Weekly reports</a>
				<p class="mt-2 text-ink-muted">VOI Weekly Reports</p>
			</Card>
		</li>
		<li>
			<Card>
				<a class="text-accent underline" href="/archive/testnet/relays">Relay rewards</a>
				<p class="mt-2 text-ink-muted">Weekly Relay Statistics</p>
			</Card>
		</li>
	</ul>
</div>
