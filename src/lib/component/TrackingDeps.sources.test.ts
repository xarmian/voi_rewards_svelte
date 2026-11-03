import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('shared tracking dependencies', () => {
	it.each(['SendTokenModal', 'BridgeModal', 'WithdrawModal'])(
		'%s uses createTrackingDeps',
		(component) => {
			const source = readFileSync(new URL(`./${component}.svelte`, import.meta.url), 'utf8');
			expect(source).toMatch(
				/import\s*\{\s*createTrackingDeps\s*\}\s*from\s*['"]\$lib\/chain\/trackingDeps['"]/
			);
			expect(source).not.toMatch(/indexerSearch\s*:/);
			if (component === 'WithdrawModal') {
				expect(source).toMatch(
					/trackPending\([\s\S]*?createTrackingDeps\(algodClient, algodIndexer\)/
				);
			} else {
				expect(source).toMatch(
					/const trackingDeps = createTrackingDeps\(algodClient, algodIndexer\)/
				);
				expect(source).toMatch(/deps:\s*trackingDeps/);
			}
		}
	);
});
