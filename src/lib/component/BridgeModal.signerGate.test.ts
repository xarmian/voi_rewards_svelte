import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync(new URL('./BridgeModal.svelte', import.meta.url), 'utf8');

// canSignTransactions now follows the selection live, so the direction rule below runs when the
// selection moves while the modal is open. It must not switch direction (which clears the
// destination fields and changes the animation) under a bridge that is already in flight.
test('the direction only falls back to algorand-to-voi while no bridge is in flight', () => {
	expect(source).toMatch(
		/\$: \{\s*if \(\s*!canSignTransactions &&\s*selectedDirection === 'voi-to-algorand' &&\s*bridgeStatus === 'idle'\s*\) \{\s*selectedDirection = 'algorand-to-voi';\s*\}\s*\}/
	);
});
