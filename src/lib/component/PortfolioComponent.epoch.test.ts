import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./PortfolioComponent.svelte', import.meta.url), 'utf8');

function epochBlock() {
	return source.match(/const epochLoading = \(async \(\) => \{[\s\S]*?\n\t\t\}\)\(\);/)?.[0] ?? '';
}

function currentEpochRow() {
	return source.match(/Current Epoch<\/span>[\s\S]*?<\/div>/)?.[0] ?? '';
}

test('the epoch block has its own loading state, reset on every fetch', () => {
	expect(source, 'Declare an epochPart state like the other parts').toMatch(/let epochPart\b/);
	const fetchStart = source.match(/async function fetchAccountDetails[\s\S]*?const epochLoading/)?.[0];
	expect(fetchStart, 'Reset epochPart to loading before the epoch block runs').toMatch(
		/epochPart = \{ status: 'loading' \}/
	);
	expect(source, 'The currentEpochRewards value must not outlive a failed load').toMatch(
		/epochPart = \{ status: 'loaded'/
	);
});

test('an epoch failure marks the part unavailable instead of leaving a 0', () => {
	const block = epochBlock();
	expect(block, 'Keep the epoch block').toContain('Error calculating rewards');
	expect(block, 'The catch must set the part unavailable').toMatch(
		/catch \(err\)[\s\S]*epochPart = \{ status: 'unavailable'/
	);
	expect(block, 'A stale wallet or generation must not write the part').toMatch(
		/generation !== loadGeneration \|\| walletAddress !== requestedWallet/
	);
});

test('Current Epoch needs both a loaded account and a loaded epoch part', () => {
	const row = currentEpochRow();
	expect(row, 'Render the figure only when the epoch part is loaded').toMatch(
		/epochPart\.status === 'loaded'/
	);
	expect(row, 'Show Unavailable with Retry when the epoch part failed').toMatch(
		/Unavailable[\s\S]*on:click=\{retryAccountDetails\}[^>]*>\s*Retry\s*</
	);
	expect(
		source.split('pendingRewards / 1e6 + currentEpochRewards').length - 1,
		'Keep exactly one place that adds the epoch figure'
	).toBe(1);
});
