<script module lang="ts">
	export type ArchiveBannerProps = {
		programme: string;
		endedOn?: string;
		frozenAt?: string;
		hubHref?: string;
	};
</script>

<script lang="ts">
	let { programme, endedOn, frozenAt, hubHref = '/archive/testnet' }: ArchiveBannerProps = $props();
</script>

<section
	aria-label="Archive notice"
	class="rounded-ds-sm border border-line bg-warn-soft p-4 text-sm text-ink"
>
	<span aria-hidden="true">!</span>
	<strong class="font-bold">Read-only archive.</strong>
	{programme}
	{endedOn ? `ended ${endedOn}.` : 'has ended.'}
	{#if frozenAt}Data is frozen as of {frozenAt}.{/if}
	<a href={hubHref} class="text-accent underline">All archived programmes</a>
</section>
