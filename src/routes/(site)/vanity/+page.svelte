<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Web3Wallet } from 'avm-wallet-svelte';
	import {
		signTransactions,
		selectedWallet,
		captureSigner,
		type TransactionSigner
	} from '$lib/chain/wallet.svelte';
	import algosdk from 'algosdk';
	import { Button, Card, CopyButton, InlineAlert, StatusPill } from '$lib/ds';
	import ResolvedAddress from '$lib/component/ResolvedAddress.svelte';
	import { capturePlan, selectionDrifted, type VanityPlan } from '$lib/chain/vanityPlan';
	import { hasThirdPartyScript, decideVanityStart } from '$lib/chain/vanityGuard';
	import { buildPayment } from '$lib/chain/txBuilders';
	import { algodClient, algodIndexer } from '$lib/utils/algod';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';

	// Worker instance - needs to be accessible outside generateVanityAddress
	let worker: Worker | null = null;
	let ready = false;
	let blocked = false;

	// Form state
	let prefix = '';
	let suffix = '';
	let isGenerating = false;
	let progress = 0;
	let attempts = 0;
	let result: { address: string; mnemonic: string } | null = null;
	let error: string | null = null;
	let maxAttempts = 10000000; // Safety limit
	let startTime: number | null = null;
	let elapsedTime = 0;
	let attemptsPerSecond = 0;
	let estimatedTimeRemaining = '';
	let updateInterval: ReturnType<typeof setInterval> | null = null;
	let lastAddressCheckedByWorker: string | null = null; // Track last checked address

	// Wallet and rekey state
	let isActivating = false;
	let isRekeying = false;
	let txnStatus: 'idle' | 'sending' | 'success' | 'error' = 'idle';
	let rekeyTxnStatus: 'idle' | 'sending' | 'success' | 'error' = 'idle';
	let txnError: string | null = null;
	let plan: VanityPlan | null = null;
	let reviewOpen = false;
	let reviewDrifted = false;
	$: if (reviewOpen && plan && selectionDrifted(plan, $selectedWallet)) reviewDrifted = true;

	// Method to validate inputs
	function validateInputs(): boolean {
		error = null;

		// Check if at least one of prefix or suffix is provided
		if (!prefix && !suffix) {
			error = 'Please specify at least a prefix or suffix for the address';
			return false;
		}

		// Check if inputs are alphanumeric
		const alphanumericRegex = /^[a-zA-Z0-9]*$/;
		if (prefix && !alphanumericRegex.test(prefix)) {
			error = 'Prefix must contain only letters and numbers';
			return false;
		}

		if (suffix && !alphanumericRegex.test(suffix)) {
			error = 'Suffix must contain only letters and numbers';
			return false;
		}

		// Check reasonable length
		if (prefix.length > 10) {
			error = 'Prefix is too long (max 10 characters)';
			return false;
		}

		if (suffix.length > 10) {
			error = 'Suffix is too long (max 10 characters)';
			return false;
		}

		// Check for valid Voi base32 characters if searching by suffix or prefix
		const base32Regex = /^[A-Z2-7]*$/i;

		if (suffix && !base32Regex.test(suffix)) {
			error = 'Suffix must contain only valid Voi address characters (A-Z, 2-7)';
			return false;
		}

		if (prefix && !base32Regex.test(prefix)) {
			error = 'Prefix must contain only valid Voi address characters (A-Z, 2-7)';
			return false;
		}

		// Add a warning about suffix search difficulty
		if (suffix && suffix.length > 3) {
			error =
				'Warning: Finding an address with a 4+ character suffix may take an extremely long time due to checksum constraints. Consider using a shorter suffix or only a prefix.';
			return false;
		}

		return true;
	}

	// Update progress statistics
	function updateStats() {
		if (!startTime) return;

		const now = Date.now();
		elapsedTime = (now - startTime) / 1000; // in seconds
		attemptsPerSecond = attempts / elapsedTime;

		// Estimate completion time if we can
		if (attemptsPerSecond > 0) {
			// Rough probability estimation based on attempt rate and character space (A-Z, 0-9 -> 36)
			// Voi uses Base32 (A-Z, 2-7 -> 32), but we'll stick with 36 for a simpler (though less accurate) calculation for now
			let validChars = prefix.length + suffix.length;
			let probabilityPerAttempt = 1 / 36 ** validChars; // Very rough!
			let estimatedAttemptsNeeded = 1 / probabilityPerAttempt;
			let remainingAttempts = Math.max(0, estimatedAttemptsNeeded - attempts);
			let remainingTimeInSeconds = remainingAttempts / attemptsPerSecond;

			if (remainingTimeInSeconds === Infinity || isNaN(remainingTimeInSeconds)) {
				estimatedTimeRemaining = 'Very long time...';
			} else if (remainingTimeInSeconds > 86400 * 30) {
				// More than 30 days
				estimatedTimeRemaining = `${(remainingTimeInSeconds / 86400).toFixed(0)}+ days`;
			} else if (remainingTimeInSeconds > 86400) {
				estimatedTimeRemaining = `${(remainingTimeInSeconds / 86400).toFixed(1)} days`;
			} else if (remainingTimeInSeconds > 3600) {
				estimatedTimeRemaining = `${(remainingTimeInSeconds / 3600).toFixed(1)} hours`;
			} else if (remainingTimeInSeconds > 60) {
				estimatedTimeRemaining = `${(remainingTimeInSeconds / 60).toFixed(1)} minutes`;
			} else {
				estimatedTimeRemaining = `${remainingTimeInSeconds.toFixed(0)} seconds`;
			}
		} else {
			estimatedTimeRemaining = 'Calculating...';
		}
	}

	// Generate the vanity address
	async function generateVanityAddress() {
		if (!ready) return;
		if (!validateInputs()) return;

		// Reset state
		isGenerating = true;
		attempts = 0;
		progress = 0;
		result = null;
		error = null; // Clear previous errors
		lastAddressCheckedByWorker = null; // Clear last checked address
		startTime = Date.now();
		if (updateInterval) clearInterval(updateInterval); // Clear previous interval if any
		if (worker) worker.terminate(); // Terminate any previous worker

		// Start the progress update interval
		updateInterval = setInterval(updateStats, 1000);

		try {
			// Create a worker for better performance and to avoid blocking the UI
			worker = new Worker(new URL('../../../lib/chain/vanity.worker.ts', import.meta.url), {
				type: 'module'
			});

			// Set up event listeners
			worker.onmessage = (e) => {
				const data = e.data;

				if (data.type === 'progress') {
					attempts = data.attempts;
					progress = (attempts / maxAttempts) * 100;
					lastAddressCheckedByWorker = data.lastAddressChecked; // Update displayed last address
					updateStats();
				} else if (data.type === 'result') {
					attempts = data.attempts;
					result = {
						address: data.address,
						mnemonic: data.mnemonic
					};
					isGenerating = false; // Set generating to false *before* cleanup

					// Stop the worker and interval
					if (worker) {
						worker.terminate();
						worker = null;
					}
					if (updateInterval) clearInterval(updateInterval);
					updateInterval = null;
				} else if (data.type === 'maxAttempts') {
					attempts = data.attempts;
					error = `Reached maximum attempts (${maxAttempts.toLocaleString()}) without finding a match.`;
					lastAddressCheckedByWorker = data.lastAddressChecked;
					isGenerating = false; // Set generating to false *before* cleanup

					// Stop the worker and interval
					if (worker) {
						worker.terminate();
						worker = null;
					}
					if (updateInterval) clearInterval(updateInterval);
					updateInterval = null;
				}
			};

			worker.onerror = (err) => {
				console.error('Worker error:', err);
				error = `Worker error: ${err.message}`;
				isGenerating = false;
				if (worker) {
					worker.terminate();
					worker = null;
				}
				if (updateInterval) clearInterval(updateInterval);
				updateInterval = null;
			};

			// Start the worker
			worker.postMessage({
				prefix,
				suffix,
				maxAttempts
			});
		} catch (err) {
			console.error('Error setting up worker:', err);
			isGenerating = false;
			error = `Error: ${err instanceof Error ? err.message : String(err)}`;
			if (worker) {
				worker.terminate();
				worker = null;
			}
			if (updateInterval) clearInterval(updateInterval);
			updateInterval = null;
		}
	}

	// Stop the search
	function stopSearch() {
		isGenerating = false;
		if (worker) {
			worker.terminate(); // Terminate the worker
			worker = null; // Clear the worker reference
		}
		if (updateInterval) {
			clearInterval(updateInterval); // Clear the interval
			updateInterval = null;
		}
		// Optionally provide feedback that the search was stopped
		if (attempts > 0 && !result) {
			error = `Search stopped after ${attempts.toLocaleString()} attempts.`;
		}
		// Reset stats that might be misleading now
		estimatedTimeRemaining = '';
		attemptsPerSecond = 0;
	}

	function reviewActivation() {
		const captured = capturePlan($selectedWallet, result?.address);
		if (!captured.ok) {
			error = captured.error;
			return;
		}
		plan = captured.plan;
		reviewDrifted = false;
		reviewOpen = true;
		error = null;
	}

	function cancelActivation() {
		reviewOpen = false;
		plan = null;
		reviewDrifted = false;
	}

	async function confirmActivation() {
		if (!plan || reviewDrifted || !reviewOpen) return;
		// The reactive flag lags a tick behind the store: check the live selection here as well.
		if (selectionDrifted(plan, $selectedWallet)) {
			reviewDrifted = true;
			return;
		}
		// The account the user confirmed. It must be the reviewed funder, wallet and all.
		let signer: TransactionSigner;
		try {
			signer = captureSigner();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			return;
		}
		if (signer.address !== plan.funder) {
			reviewDrifted = true;
			return;
		}
		reviewOpen = false;
		await activateVanityAddress(plan, signer);
	}

	// Send 1 VOI from the reviewed account, then rekey to that same account.
	async function activateVanityAddress(plan: VanityPlan, signer: TransactionSigner) {
		isActivating = true;
		txnStatus = 'sending';
		txnError = null;

		try {
			// Get parameters for the transaction
			const params = await algodClient.getTransactionParams().do();

			// Create an unsigned transaction to send 1 VOI to the vanity address
			// 1 VOI = 1,000,000 microVOI
			const unsignedTxn = buildPayment({
				from: plan.funder,
				to: plan.vanity,
				amount: 1000000, // 1 VOI in microVOI
				suggestedParams: params
			});

			// Ask user to sign the transaction
			const signedTxns = await signTransactions([[unsignedTxn]], signer);

			// Send the signed transaction to the network
			const { txid: txId } = await algodClient.sendRawTransaction(signedTxns).do();

			// Wait for confirmation
			await algosdk.waitForConfirmation(algodClient, txId, 5);

			txnStatus = 'success';

			// After sending 1 VOI, we can now initiate the rekey transaction
			await rekeyVanityAddress(plan);
		} catch (err) {
			console.error('Failed to activate address:', err);
			txnStatus = 'error';
			txnError = err instanceof Error ? err.message : String(err);
		} finally {
			isActivating = false;
		}
	}

	// Rekey the vanity address
	async function rekeyVanityAddress(plan: VanityPlan) {
		isRekeying = true;
		rekeyTxnStatus = 'sending';

		try {
			if (!result || result.address !== plan.vanity) {
				throw new Error('The generated vanity address changed. Review again.');
			}
			const mnemonic = result.mnemonic;
			// Get parameters for the transaction
			const params = await algodClient.getTransactionParams().do();

			// Convert the mnemonic to a keypair for signing
			const vanityAccount = algosdk.mnemonicToSecretKey(mnemonic);

			// Create a rekey transaction to point to the reviewed target account
			const rekeyTxn = buildPayment({
				from: plan.vanity,
				to: plan.vanity, // Send to self
				amount: 0, // Zero amount for rekey
				suggestedParams: params,
				rekeyTo: plan.rekeyTo
			});

			// Sign the transaction with the vanity address secret key
			const signedRekeyTxn = rekeyTxn.signTxn(vanityAccount.sk);

			// Send the signed transaction to the network
			const { txid: txId } = await algodClient.sendRawTransaction(signedRekeyTxn).do();

			// Wait for confirmation
			await algosdk.waitForConfirmation(algodClient, txId, 5);

			rekeyTxnStatus = 'success';
		} catch (err) {
			console.error('Failed to rekey address:', err);
			rekeyTxnStatus = 'error';
			txnError = err instanceof Error ? err.message : String(err);
		} finally {
			isRekeying = false;
		}
	}

	onMount(() => {
		const thirdParty = hasThirdPartyScript(
			document,
			location.origin,
			window as Window & { dataLayer?: unknown }
		);
		let alreadyReloaded = true;
		try {
			alreadyReloaded = sessionStorage.getItem('vanity-reloaded') === '1';
		} catch {
			// Storage is unavailable: keep alreadyReloaded true, so a third-party script blocks.
		}
		const decision = decideVanityStart({ thirdParty, alreadyReloaded });
		if (decision === 'reload') {
			try {
				sessionStorage.setItem('vanity-reloaded', '1');
			} catch {
				blocked = true;
				return;
			}
			window.location.reload();
			return;
		}
		if (decision === 'blocked') {
			blocked = true;
			return;
		}
		try {
			sessionStorage.removeItem('vanity-reloaded');
		} catch {
			// Nothing to clear when storage is unavailable.
		}
		ready = true;
	});

	// Clean up on unmount
	onDestroy(() => {
		if (updateInterval) clearInterval(updateInterval);
		if (worker) {
			worker.terminate(); // Ensure worker is terminated on component destroy
			worker = null;
		}
	});
</script>

<svelte:head>
	<title>Vanity Address Generator | Voi</title>
	<meta name="description" content="Generate a Voi vanity address with custom prefix and suffix" />
</svelte:head>

<div class="container-page space-y-8 py-8 text-ink md:py-12">
	<header class="max-w-3xl">
		<a href="/how_to_node" class="text-label text-accent underline underline-offset-4"
			>← Run a node</a
		>
		<h1 class="mt-4 text-display">Vanity address generator</h1>
		<p class="mt-4 text-body text-ink-muted">
			Create a Voi address with a chosen prefix or suffix.
		</p>
	</header>

	{#if blocked}
		<InlineAlert
			message="Key generation is switched off because another script is loaded in this page. Open voirewards.com/vanity directly in a new tab."
		/>
	{/if}

	{#if ready}
		<Card title="Choose your pattern">
			<p class="mb-6 text-body text-ink-muted">
				Computation happens in your browser; keys are never sent anywhere.
			</p>
			<form on:submit|preventDefault={generateVanityAddress} class="space-y-6">
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div class="min-w-0">
						<label for="prefix" class="mb-2 block text-label">Prefix · start of address</label>
						<input
							id="prefix"
							type="text"
							bind:value={prefix}
							placeholder="e.g. VOI"
							class="min-h-11 w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-4 py-2 text-body text-ink placeholder:text-ink-muted"
							disabled={isGenerating}
							maxlength="10"
							pattern="[a-zA-Z0-9]*"
							title="Prefix must contain only letters and numbers"
							aria-describedby="prefix-help"
						/>
						<p id="prefix-help" class="mt-2 text-sm text-ink-muted">
							Case-insensitive. Must be valid Base32 (A-Z, 2-7). Max 10 chars.
						</p>
					</div>
					<div class="min-w-0">
						<label for="suffix" class="mb-2 block text-label">Suffix · end of address</label>
						<input
							id="suffix"
							type="text"
							bind:value={suffix}
							placeholder="e.g. 777"
							class="min-h-11 w-full min-w-0 rounded-ds-sm border border-edge bg-surface px-4 py-2 text-body text-ink placeholder:text-ink-muted"
							disabled={isGenerating}
							maxlength="10"
							pattern="[A-Z2-7]*"
							title="Suffix must contain only A-Z and 2-7"
							aria-describedby="suffix-help suffix-warning"
						/>
						<p id="suffix-help" class="mt-2 text-sm text-ink-muted">
							Case-insensitive. Must be valid Base32 (A-Z, 2-7). Max 10 chars.
						</p>
						<p id="suffix-warning" class="mt-2 text-sm text-warn">
							Note: Due to address checksum constraints, finding a specific suffix may be limited.
						</p>
					</div>
				</div>
				{#if !isGenerating}
					<Button type="submit" disabled={!prefix && !suffix}>Generate Vanity Address</Button>
				{:else}
					<Button variant="soft" onclick={stopSearch}>Stop Search</Button>
				{/if}
			</form>

			{#if isGenerating}
				<div class="mt-6 space-y-3 text-sm text-ink-muted">
					<div class="space-y-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div aria-live="polite">
								<StatusPill tone="info" label="Checking addresses…" />
							</div>
							<span>{attempts.toLocaleString()} attempts</span>
						</div>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
							<div><span class="font-bold">Time elapsed:</span> {elapsedTime.toFixed(1)}s</div>
							<div>
								<span class="font-bold">Speed:</span>
								{attemptsPerSecond.toFixed(1)} addr/sec
							</div>
							<div>
								<span class="font-bold">Est. time:</span>
								{estimatedTimeRemaining || 'Calculating...'}
							</div>
						</div>
					</div>
					{#if lastAddressCheckedByWorker}
						<p class="break-all font-mono text-xs">Last checked: {lastAddressCheckedByWorker}</p>
					{/if}
				</div>
			{/if}
			{#if error}
				<div class="mt-6 [overflow-wrap:anywhere]">
					<InlineAlert message={error} />
					{#if isGenerating && lastAddressCheckedByWorker}
						<p class="mt-2 break-all font-mono text-xs text-ink-muted">
							Last checked: {lastAddressCheckedByWorker}
						</p>
					{/if}
				</div>
			{/if}
		</Card>

		{#if result}
			<Card title="Address found">
				<div class="space-y-6">
					<div>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-label">Address</h3>
							<CopyButton text={result.address} what="address" />
						</div>
						<p class="mt-2 rounded-ds-sm bg-surface-2 p-3 break-all font-mono text-sm">
							{result?.address || ''}
						</p>
					</div>
					<div>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="text-label">Mnemonic (Secret Recovery Phrase)</h3>
							<CopyButton text={result.mnemonic} what="mnemonic" />
						</div>
						<p
							class="mt-2 rounded-ds-sm border border-line bg-surface-2 p-3 font-mono text-sm [overflow-wrap:anywhere]"
						>
							{result?.mnemonic || ''}
						</p>
					</div>
					<InlineAlert
						tone="warn"
						message="Important Security Notice: Save your mnemonic phrase securely offline. Never share it. Anyone with this phrase can access your funds."
					/>
				</div>
			</Card>

			<Card title="Secure your vanity address">
				<p class="mb-6 text-body text-ink-muted">
					To use this address securely, you can rekey it to your primary wallet. This allows you to
					control the vanity address without exposing its private key.
				</p>
				<div class="space-y-6">
					<div>
						<h3 class="mb-3 text-h2">Step 1: Connect Your Main Wallet</h3>
						<!-- prettier-ignore -->
						<Web3Wallet
								enabledWallets={['walletconnect', 'kibisis', 'lute', 'biatec', 'voiwallet']}
								class="bg-gray-100 dark:bg-slate-600 dark:text-gray-200"
								allowWatchAccounts={false}
								showSignInStatus={false}
								displayMode="dropdown"
								{algodClient}
								indexerClient={algodIndexer}
								wcConfig={{
									projectId: wcProjectId,
									name: 'Voi Rewards Auditor',
									description: 'Voi Rewards Auditor',
									url: 'https://voirewards.com',
									icons: ['https://voirewards.com/android-chrome-192x192.png']
								}}
							/>
						{#if plan}
							<div class="mt-3">
								<ResolvedAddress address={plan.rekeyTo} label="Activation account" />
							</div>
						{:else if $selectedWallet?.address && $selectedWallet?.app !== 'Watch'}
							<p class="mt-3 break-all font-mono text-sm">Connected: {$selectedWallet.address}</p>
						{/if}
					</div>
					<div class="space-y-4 border-t border-line pt-6">
						<h3 class="text-h2">Step 2: Fund &amp; Rekey Address</h3>
						{#if error && result}
							<div class="[overflow-wrap:anywhere]">
								<InlineAlert message={error} />
							</div>
						{/if}
						<p class="text-body text-ink-muted">
							This process will send 1 VOI to your vanity address, then rekey it to the account you
							review below.
						</p>
						{#if txnStatus === 'success' && rekeyTxnStatus === 'success'}
							<StatusPill
								tone="ok"
								label="Success! Your vanity address is now rekeyed to the reviewed account."
							/>
						{:else if reviewOpen && plan}
							<div class="space-y-3" aria-label="Review vanity activation">
								<ResolvedAddress address={plan.vanity} label="Vanity address" />
								<ResolvedAddress address={plan.rekeyTo} label="Rekey target" />
								{#if reviewDrifted}
									<InlineAlert message="Your selected account changed. Review again." />
								{/if}
								<div class="flex flex-wrap gap-3">
									<Button onclick={confirmActivation} disabled={reviewDrifted}>Confirm</Button>
									<Button variant="ghost" onclick={cancelActivation}>Cancel</Button>
								</div>
							</div>
						{:else}
							<Button
								onclick={() => reviewActivation()}
								disabled={!($selectedWallet?.address && $selectedWallet?.app !== 'Watch') ||
									isActivating ||
									isRekeying ||
									txnStatus === 'sending' ||
									rekeyTxnStatus === 'sending'}
							>
								{#if isActivating || txnStatus === 'sending'}
									Funding Address...
								{:else if isRekeying || rekeyTxnStatus === 'sending'}
									Rekeying Address...
								{:else}
									Fund &amp; Rekey Address
								{/if}
							</Button>
						{/if}
						<div class="[overflow-wrap:anywhere]">
							{#if txnStatus === 'error'}
								<InlineAlert
									message={`Funding was not confirmed. Check the vanity address balance before trying again. ${txnError ?? ''}`}
								/>
							{:else if rekeyTxnStatus === 'error' && txnStatus === 'success'}
								<InlineAlert
									message={`Funding was confirmed, but the rekey was not. Check this address before trying again. ${txnError ?? ''}`}
								/>
							{/if}
						</div>
					</div>
					{#if txnStatus === 'success' && rekeyTxnStatus === 'success'}
						<div class="space-y-2 rounded-ds-sm bg-accent-soft p-4 text-sm text-accent">
							<h3 class="font-bold">What now?</h3>
							<p>Your vanity address is now fully set up:</p>
							<ul class="list-disc space-y-1 pl-5">
								<li>You can now use this address from your main wallet.</li>
								<li>The original seed phrase is no longer needed for signing transactions.</li>
							</ul>
						</div>
					{/if}
				</div>
			</Card>
		{/if}
	{/if}

	<Card title="About vanity addresses">
		<div class="space-y-4 text-body text-ink-muted">
			<p>
				Vanity addresses are standard Voi addresses with a personalized touch, containing specific
				characters at the beginning or end. They function identically to regular addresses.
			</p>
			<ul class="list-disc space-y-3 pl-5">
				<li>
					<strong class="text-ink">Difficulty increases exponentially:</strong> Each additional character
					you specify makes finding a match significantly harder (roughly 32 times harder per character
					due to Base32 encoding). Short prefixes/suffixes are much faster.
				</li>
				<li>
					<strong class="text-ink">Valid characters:</strong> Voi addresses use Base32 encoding (A-Z
					and 2-7).
				</li>
				<li>
					<strong class="text-ink">Client-side generation:</strong> All calculations happen within your
					browser. Your secret mnemonic phrase is generated locally and is never transmitted over the
					network.
				</li>
				<li>
					<strong class="text-ink">Secure your mnemonic:</strong> Treat the generated mnemonic phrase
					like digital cash. Write it down, store it securely offline, and never share it. Loss of the
					mnemonic means loss of access to the address and any funds within it.
				</li>
				<li>
					<strong class="text-ink">Performance:</strong> Generation speed depends heavily on your computer's
					processing power. Complex patterns can take a very long time.
				</li>
			</ul>
		</div>
	</Card>
</div>
