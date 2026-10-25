<script lang="ts">
	import { ago, comma, compact, pct, shortAddr, usd } from '$lib/ds/format';

	// Design-system gallery shell (DESIGN-SYSTEM.md §4). Components from C1 onward add a
	// section here with every state, using fixture data.

	const colours: [string, string][] = [
		['bg-canvas', 'canvas'],
		['bg-surface', 'surface'],
		['bg-surface-2', 'surface-2'],
		['bg-line', 'line'],
		['bg-edge', 'edge'],
		['bg-ink', 'ink'],
		['bg-ink-muted', 'ink-muted'],
		['bg-accent', 'accent'],
		['bg-accent-fill', 'accent-fill'],
		['bg-accent-soft', 'accent-soft'],
		['bg-hi', 'hi'],
		['bg-hi-ink', 'hi-ink'],
		['bg-hi-soft', 'hi-soft'],
		['bg-ok', 'ok'],
		['bg-ok-soft', 'ok-soft'],
		['bg-warn', 'warn'],
		['bg-warn-soft', 'warn-soft'],
		['bg-danger', 'danger'],
		['bg-danger-soft', 'danger-soft'],
		['bg-focus', 'focus'],
		['bg-grid', 'grid'],
		['bg-series-3', 'series-3'],
		['bg-expected', 'expected'],
		['bg-expected-halo', 'expected-halo']
	];

	const type: [string, string][] = [
		['text-display', 'Display 50/34'],
		['text-hero-num', '16.04%'],
		['text-stat', '55.94M'],
		['text-title', 'Title 32/26'],
		['text-lede', 'Lede: the one-sentence answer.'],
		['text-h2', 'Card title (h2)'],
		['text-body', 'Body text at 15px, the default size for paragraphs.'],
		['text-sm', 'Small: table cells and list rows'],
		['text-label', 'Label: tile labels, captions'],
		['text-micro', 'MICRO: TABLE HEADERS, CHIPS']
	];

	const radii = [
		'rounded-xs',
		'rounded-sm',
		'rounded-md',
		'rounded-card',
		'rounded-hero',
		'rounded-full'
	];

	const now = Date.now();
	const numbers: [string, string][] = [
		['compact(139592135.92)', compact(139592135.92)],
		['compact(576123, 1)', compact(576123, 1)],
		['compact(9999)', compact(9999)],
		['comma(2236808)', comma(2236808)],
		['usd(0.004213)', usd(0.004213)],
		['usd(1234.5)', usd(1234.5)],
		['pct(16.039)', pct(16.039)],
		['ago(5 minutes ago)', ago(now - 5 * 60_000, now)],
		['shortAddr(…)', shortAddr('G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ')],
		['compact(null)', compact(null)]
	];
</script>

<svelte:head>
	<title>Design system | Voi Rewards Auditor</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-canvas text-ink">
	<header class="on-hero bg-hero pb-[84px] pt-10 text-on-hero rounded-b-hero">
		<div class="container-page">
			<h1 class="text-display">Design system</h1>
			<p class="mt-2 text-lede text-on-hero-muted">
				Tokens, type and formatting (T1). Components are added here as they land.
			</p>
			<span class="mt-4 inline-block rounded-full bg-on-hero-surface px-3 py-1 text-micro">
				Preview only
			</span>
		</div>
	</header>

	<main class="container-page -mt-[60px] grid gap-bento pb-16">
		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Colour</h2>
			<ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
				{#each colours as [cls, name] (name)}
					<li class="text-label">
						<div class="h-12 rounded-xs border border-line {cls}"></div>
						<span class="mt-1 block text-ink-muted">{name}</span>
					</li>
				{/each}
			</ul>
			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				<div class="h-12 rounded-xs bg-hero"></div>
				<div class="h-3 self-center rounded-full bg-bar"></div>
			</div>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Type</h2>
			<ul class="mt-4 space-y-3">
				{#each type as [cls, sample] (cls)}
					<li class="flex flex-wrap items-baseline gap-x-4">
						<code class="w-28 shrink-0 text-micro text-ink-muted">{cls}</code>
						<span class={cls}>{sample}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Radii and shadows</h2>
			<ul class="mt-4 flex flex-wrap gap-4">
				{#each radii as r (r)}
					<li class="text-label text-ink-muted">
						<div class="h-16 w-24 border border-edge bg-surface-2 {r}"></div>
						<span class="mt-1 block">{r}</span>
					</li>
				{/each}
				<li class="text-label text-ink-muted">
					<div class="h-16 w-24 rounded-sm bg-surface shadow-card"></div>
					<span class="mt-1 block">shadow-card</span>
				</li>
				<li class="text-label text-ink-muted">
					<div class="h-16 w-24 rounded-sm bg-surface shadow-pop"></div>
					<span class="mt-1 block">shadow-pop</span>
				</li>
			</ul>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Formatting</h2>
			<table class="mt-4 w-full text-sm">
				<thead>
					<tr class="text-left text-micro text-ink-muted">
						<th scope="col" class="py-2 font-bold">Call</th>
						<th scope="col" class="py-2 font-bold">Output</th>
					</tr>
				</thead>
				<tbody>
					{#each numbers as [call, out] (call)}
						<tr class="border-t border-line">
							<td class="py-2"><code>{call}</code></td>
							<td class="num py-2 font-bold">{out}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="rounded-card bg-surface p-card shadow-card">
			<h2 class="text-h2">Controls</h2>
			<div class="mt-4 flex flex-wrap items-center gap-3">
				<button class="rounded-sm bg-primary-700 px-4 py-2.5 font-bold text-white">Primary</button>
				<button class="rounded-sm bg-accent-soft px-4 py-2.5 font-bold text-accent">Soft</button>
				<button class="rounded-sm px-4 py-2.5 font-bold text-accent">Ghost</button>
				<input
					class="rounded-sm border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
					placeholder="Input with edge border"
					aria-label="Example input"
				/>
				<a href="/ds" class="text-accent underline">A link</a>
			</div>
		</section>
	</main>
</div>
