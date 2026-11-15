<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Card, InlineAlert, StatusPill } from '$lib/ds';
	import { REWARDS_ADDRESSES } from '$lib/rewards/calculateEpochRewards';
	import {
		normalizeOptions,
		OptionsError,
		type ActivityType,
		type ExportOptions
	} from '$lib/wallet/transactionExport';
	import { buildStakingContractMap, type StakingContract } from '$lib/wallet/stakingContracts';
	import { exportFilename, serializeCsv } from '$lib/wallet/transactionCsv';
	import {
		createExportRun,
		createIndexerReader,
		isValidAddress,
		type ExportRun,
		type ExportResult,
		type ExportProgress
	} from '$lib/services/transactionExport';

	let {
		pageAddress,
		suggestions,
		suggestionsAvailable,
		stakingContracts,
		stakingContractsAvailable,
		onclose
	}: {
		pageAddress: string;
		suggestions: { address: string; label?: string }[];
		suggestionsAvailable: boolean;
		stakingContracts: StakingContract[];
		stakingContractsAvailable: boolean;
		onclose: () => void;
	} = $props();
	const today = () => new Date().toISOString().slice(0, 10);
	let from = $state(today().slice(0, 4) + '-01-01');
	let through = $state(today());
	let allDates = $state(false);
	let selected = $state<string[]>(untrack(() => [pageAddress]));
	let additional = $state('');
	let assetMode = $state<'native' | 'all' | 'asset'>('native');
	let assetId = $state('');
	let types = $state<ActivityType[]>([
		'payment',
		'reward-payout',
		'asset-transfer',
		'close-out',
		'fee'
	]);
	const typeChoices: { value: ActivityType; label: string }[] = [
		{ value: 'payment', label: 'Payments' },
		{ value: 'reward-payout', label: 'Known reward payouts' },
		{ value: 'asset-transfer', label: 'Asset transfers' },
		{ value: 'close-out', label: 'Close-outs' },
		{ value: 'fee', label: 'Fees' }
	];
	const choices = $derived([
		...new Map(
			[
				{ address: pageAddress, label: 'Page address' },
				...suggestions.filter((s) => s.address !== pageAddress)
			].map((s) => [s.address, s])
		).values()
	]);
	let errors = $state<Partial<Record<'dates' | 'accounts' | 'types' | 'assets', string>>>({});
	let busy = $state(false);
	let result = $state.raw<ExportResult | null>(null);
	let frozen = $state.raw<ExportOptions | null>(null);
	let progress = $state<ExportProgress | null>(null);
	let liveStatus = $state('Ready to export.');
	let heading: HTMLHeadingElement;
	let region: HTMLElement;
	let run: ExportRun | undefined;
	let generation = 0;
	let pendingProgress: ExportProgress | null = null;
	let objectUrl: string | undefined;
	let revokeTimer: ReturnType<typeof setTimeout> | undefined;
	const locked = $derived(busy || result !== null);
	const range = $derived(
		frozen?.allDates
			? 'All indexed dates (UTC)'
			: frozen
				? `${frozen.from} through ${frozen.through} (UTC)`
				: ''
	);
	const scope = $derived(
		frozen?.assets.mode === 'asset'
			? `Asset ${frozen.assets.id} (ASA/VSA)`
			: frozen?.assets.mode === 'all'
				? 'VOI and all assets'
				: 'VOI only'
	);
	const statusText = $derived(
		busy
			? progress
				? `${progress.resolvingAssetId !== undefined ? `Resolving asset ${progress.resolvingAssetId} · ${progress.assetsResolved} asset definitions loaded · ` : ''}Account ${progress.account} of ${progress.accounts} · ${progress.pages} pages · ${progress.scanned} transactions scanned · ${progress.rows} rows${progress.retrySeconds ? ` · Retrying in ${progress.retrySeconds} seconds` : ''}`
				: 'Capturing the indexed round…'
			: result
				? `${result.rows.length} rows · ${scope} · ${result.status === 'complete-indexed' ? 'Complete through the captured indexed round' : result.reason}`
				: 'Ready to export.'
	);
	function revokeDownload() {
		clearTimeout(revokeTimer);
		if (objectUrl) URL.revokeObjectURL(objectUrl);
		objectUrl = undefined;
	}
	function clearRun() {
		generation++;
		run?.dispose();
		run = undefined;
		revokeDownload();
		result = null;
		frozen = null;
		busy = false;
		progress = null;
		pendingProgress = null;
	}
	$effect(() => {
		heading.focus();
		const timer = setInterval(() => {
			progress = pendingProgress;
			liveStatus = statusText;
		}, 1000);
		return () => {
			clearInterval(timer);
			clearRun();
		};
	});
	function close() {
		clearRun();
		onclose();
	}
	function escape(event: KeyboardEvent) {
		if (event.key === 'Escape' && event.target instanceof Node && region?.contains(event.target)) {
			event.preventDefault();
			close();
		}
	}
	async function start() {
		errors = {};
		let options: ExportOptions;
		try {
			options = normalizeOptions(
				{
					assets: assetMode === 'asset' ? { mode: 'asset', id: assetId } : { mode: assetMode },
					pageAddress,
					addresses: [...selected, ...additional.split(/\r?\n/)],
					allDates,
					from,
					through,
					types
				},
				today(),
				isValidAddress
			);
		} catch (error) {
			if (error instanceof OptionsError) errors = { [error.field]: error.message };
			return;
		}
		clearRun();
		frozen = options;
		busy = true;
		const current = generation;
		run = createExportRun(options, {
			...createIndexerReader(),
			rewardSenders: new Set(REWARDS_ADDRESSES),
			stakingContracts: buildStakingContractMap(stakingContracts, stakingContractsAvailable),
			onProgress: (value) => {
				if (generation === current) pendingProgress = value;
			}
		});
		const completed = await run.start();
		if (current !== generation) return;
		result = completed;
		busy = false;
		progress = pendingProgress;
	}
	async function retry() {
		if (!run || busy) return;
		busy = true;
		const current = generation;
		const completed = await run.retry();
		if (current !== generation) return;
		result = completed;
		busy = false;
	}
	function download() {
		if (!result || !frozen || (result.status !== 'complete-indexed' && !result.rows.length)) return;
		revokeDownload();
		objectUrl = URL.createObjectURL(
			new Blob([serializeCsv(result.rows, result)], { type: 'text/csv;charset=utf-8' })
		);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = exportFilename(frozen, { ...result, pageAddress });
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		revokeTimer = setTimeout(revokeDownload, 0);
	}
	function toggleAllDates() {
		if (allDates) {
			from = '';
			through = '';
		} else {
			from = today().slice(0, 4) + '-01-01';
			through = today();
		}
	}
</script>

<svelte:window onkeydown={escape} />
<section
	id="voi-activity-export"
	bind:this={region}
	aria-labelledby="voi-activity-export-heading"
	class="mt-5 min-w-0 max-w-3xl [overflow-wrap:anywhere]"
>
	<Card>
		<div class="space-y-5">
			<div class="space-y-2">
				<h2 id="voi-activity-export-heading" bind:this={heading} tabindex="-1" class="text-h2">
					Export wallet activity
				</h2>
				<p>
					Export native VOI and ASA/VSA transfer activity for the selected assets. ARC-200 tokens
					aren't included. LP positions and valuations aren't included.
				</p>
				<p class="text-sm text-ink-muted">
					Up to 200 pages, 100,000 rows or 200 asset definitions per export; narrow the dates or
					select one asset if capped. Dates and timestamps are UTC.
				</p>
			</div>
			<fieldset
				disabled={locked}
				aria-describedby={errors.dates ? 'export-dates-error' : undefined}
				class="min-w-0 space-y-3"
			>
				<legend class="font-bold">Dates</legend>
				<label class="flex items-center gap-2"
					><input type="checkbox" bind:checked={allDates} onchange={toggleAllDates} /> All indexed dates</label
				>
				<div class="grid min-w-0 gap-3 sm:grid-cols-2">
					<label class="min-w-0"
						>From (UTC)<input
							class="mt-1 block w-full min-w-0 rounded-ds-sm border border-edge bg-surface p-2 text-ink"
							type="date"
							bind:value={from}
							disabled={allDates}
							max={today()}
							aria-invalid={!!errors.dates}
							aria-describedby={errors.dates ? 'export-dates-error' : undefined}
						/></label
					>
					<label class="min-w-0"
						>Through (UTC)<input
							class="mt-1 block w-full min-w-0 rounded-ds-sm border border-edge bg-surface p-2 text-ink"
							type="date"
							bind:value={through}
							disabled={allDates}
							max={today()}
							aria-invalid={!!errors.dates}
							aria-describedby={errors.dates ? 'export-dates-error' : undefined}
						/></label
					>
				</div>
				{#if errors.dates}<p id="export-dates-error" role="alert">{errors.dates}</p>{/if}
			</fieldset>
			<fieldset
				disabled={locked}
				aria-describedby={errors.accounts ? 'export-accounts-error' : 'export-accounts-help'}
				class="min-w-0 space-y-3"
			>
				<legend class="font-bold">Accounts / contracts</legend>
				<p id="export-accounts-help" class="text-sm text-ink-muted">
					Select up to 10 addresses. Suggestions describe currently known accounts, not all
					historical accounts. Additional accounts increase scanning time.
				</p>
				{#each choices as choice (choice.address)}
					<label class="flex min-w-0 items-start gap-2"
						><input
							type="checkbox"
							value={choice.address}
							bind:group={selected}
							class="mt-1 shrink-0"
						/><span class="min-w-0"
							>{#if choice.label}<span class="block font-bold">{choice.label}</span
								>{/if}{choice.address}</span
						></label
					>
				{/each}
				{#if !suggestionsAvailable}<p class="text-sm text-ink-muted">
						Contract suggestions unavailable; add addresses manually.
					</p>{/if}
				<label class="block"
					>Additional addresses (one per line)<textarea
						bind:value={additional}
						rows="3"
						spellcheck="false"
						class="mt-1 block w-full min-w-0 rounded-ds-sm border border-edge bg-surface p-2 text-ink"
						aria-invalid={!!errors.accounts}
						aria-describedby={errors.accounts ? 'export-accounts-error' : 'export-accounts-help'}
					></textarea></label
				>
				{#if errors.accounts}<p id="export-accounts-error" role="alert">{errors.accounts}</p>{/if}
			</fieldset>
			<fieldset
				disabled={locked}
				aria-describedby={errors.types ? 'export-types-error' : 'export-types-help'}
				class="space-y-3"
			>
				<legend class="font-bold">Activity types</legend>
				{#each typeChoices as choice (choice.value)}<label class="flex items-center gap-2"
						><input type="checkbox" value={choice.value} bind:group={types} />{choice.label}</label
					>{/each}
				<p id="export-types-help" class="text-sm text-ink-muted">
					Payments and asset transfers include inner transactions. Zero-amount asset transfers and
					close-outs are included. Known reward payouts are native VOI only, classified by sender;
					estimated rewards are excluded. The Staking contract column marks transfers to and from
					the staking contracts this wallet owns now, as this site knows them. Contracts it owned
					earlier are not marked unless you add their address. Type filters do not reduce scanning
					time.
				</p>
				{#if !stakingContractsAvailable}
					<InlineAlert
						tone="warn"
						message="Staking contracts couldn't be loaded, so the Staking contract column will be empty."
					/>
				{/if}
				{#if errors.types}<p id="export-types-error" role="alert">{errors.types}</p>{/if}
			</fieldset>
			<fieldset disabled={locked} class="w-full min-w-0 max-w-full space-y-3">
				<label for="export-assets" class="block font-bold">Assets</label>
				<select
					id="export-assets"
					aria-describedby="export-assets-help"
					bind:value={assetMode}
					class="block w-full min-w-0 max-w-full rounded-ds-sm border border-edge bg-surface p-2 text-ink focus-visible:ring-2 focus-visible:ring-focus"
				>
					<option value="native">VOI only</option>
					<option value="all">VOI and all assets</option>
					<option value="asset">One asset (ASA/VSA)</option>
				</select>
				{#if assetMode === 'asset'}
					<label for="export-asset-id" class="block font-bold">Asset ID</label>
					<input
						id="export-asset-id"
						type="text"
						inputmode="numeric"
						bind:value={assetId}
						aria-invalid={!!errors.assets}
						aria-describedby={errors.assets
							? 'export-assets-help export-assets-error'
							: 'export-assets-help'}
						class="block w-full min-w-0 max-w-full rounded-ds-sm border border-edge bg-surface p-2 text-ink focus-visible:ring-2 focus-visible:ring-focus"
					/>
					{#if errors.assets}<p id="export-assets-error" role="alert">{errors.assets}</p>{/if}
				{/if}
				<p id="export-assets-help" class="text-sm text-ink-muted">
					One asset includes that asset's transfers and close-outs. When Fees is selected, all VOI
					fees paid by selected accounts are included, regardless of asset. Asset filters do not
					reduce scanning time.
				</p>
			</fieldset>
			<div class="space-y-2 text-sm text-ink-muted">
				<p>
					Includes only selected addresses and indexed activity through the captured round. This is
					not a balance reconciliation or cost-basis report.
				</p>
				<p>
					Amounts and rounds are exact in the CSV. Import numeric columns as text to preserve
					precision in spreadsheets. Text fields may have a leading apostrophe for spreadsheet
					safety.
				</p>
				<p>
					Rows use unsigned amounts: incoming adds, outgoing subtracts, self has zero net effect,
					and fee rows subtract only Fee (VOI). Within-block ordering is unknown when the indexer
					omits an offset.
				</p>
			</div>
			<div aria-busy={busy} class="space-y-3">
				<p aria-live="polite" aria-atomic="true" class="sr-only">{liveStatus}</p>
				{#if busy || !result}<p>{statusText}</p>{/if}
				{#if result && frozen}
					<StatusPill
						tone={result.status === 'complete-indexed' ? 'ok' : 'warn'}
						label={result.status === 'complete-indexed'
							? 'Complete indexed activity'
							: 'Partial export'}
					/>
					{#if result.status !== 'complete-indexed'}<InlineAlert
							tone={result.status === 'partial-error' ? 'danger' : 'warn'}
							message={result.reason}
						/>{/if}
					{#if result.status === 'complete-indexed' && !result.rows.length}<p>
							No matching indexed activity for these options.
						</p>{/if}
					<p>
						{result.rows.length} rows · {scope} · {range} · {frozen.addresses.length} selected
						{frozen.addresses.length === 1 ? 'address' : 'addresses'} · {result.snapshotRound > 0n
							? `indexed through round ${result.snapshotRound.toString()}`
							: 'Snapshot round not captured'}
					</p>
					<p>{result.pages} committed pages · {result.scanned} transactions scanned</p>
					{#if result.oldestTimestamp !== undefined && result.newestTimestamp !== undefined}<p>
							Included timestamps: {new Date(result.oldestTimestamp * 1000).toISOString()} to {new Date(
								result.newestTimestamp * 1000
							).toISOString()}. A partial export is not necessarily a contiguous date range across
							accounts.
						</p>{/if}
					<p>Completed addresses: {result.completedAddresses.join(', ') || 'None'}</p>
					{#if result.unfinishedAddresses.length}<p>
							Unfinished addresses: {result.unfinishedAddresses.join(', ')}
						</p>
						<p>
							Current account boundary: {result.cursor
								? `after cursor ${result.cursor}`
								: 'before the first page'}.
						</p>{/if}
				{/if}
			</div>
			<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
				{#if busy}
					<Button variant="soft" onclick={() => run?.cancel()}>Cancel</Button>
				{:else if result}
					{#if result.canRetry}<Button onclick={retry}>Retry failed page</Button>{/if}
					{#if result.status === 'complete-indexed' || result.rows.length}<Button onclick={download}
							>{result.status === 'complete-indexed'
								? 'Download CSV'
								: 'Download partial CSV'}</Button
						>{/if}
					<Button variant="soft" onclick={clearRun}
						>{result.status === 'partial-error' && !result.canRetry
							? 'Start again'
							: 'New export'}</Button
					>
				{:else}<Button onclick={start}>Start export</Button>{/if}
				<Button variant="ghost" onclick={close}>Close</Button>
			</div>
		</div>
	</Card>
</section>
