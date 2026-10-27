<script lang="ts">
	import { footerLinks } from './links';
</script>

<footer class="bg-canvas text-ink-muted border-t border-line">
	<div class="container-page flex flex-wrap items-center justify-between gap-4 py-6 text-label">
		<p>voirewards.com · unofficial, community-run</p>
		<nav aria-label="Footer">
			<ul class="flex flex-wrap gap-x-5 gap-y-3">
				{#each footerLinks as link (link.label)}
					<li>
						<a
							href={link.href}
							target={link.external ? '_blank' : undefined}
							rel={link.external ? 'noopener' : undefined}
							class="text-ink-muted underline hover:text-ink"
							>{link.label}{#if link.label === 'About Voi'}{' '}<span aria-hidden="true">↗</span
								>{/if}{#if link.external}<span class="sr-only">{' (opens in a new tab)'}</span
								>{/if}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</footer>
