import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { badgeText } from './badge';

const fresh = { tone: 'ok', minutesOld: 0, unavailable: false } as const;
const base = { status: fresh, round: 23890168, seconds: 3, variant: 'hero', epoch: 104 } as const;
const cases: [string, Parameters<typeof badgeText>[0], string][] = [
	['hero fresh', base, 'Epoch 104 live · block 23,890,168'],
	['bar fresh', { ...base, variant: 'bar' }, '#23,890,168 · 3 s'],
	['hero before client epoch', { ...base, epoch: undefined }, 'Block 23,890,168 live'],
	...(['hero', 'bar'] as const).flatMap(
		(variant): [string, Parameters<typeof badgeText>[0], string][] => [
			[
				`${variant} stale`,
				{ ...base, variant, status: { tone: 'warn', minutesOld: 7, unavailable: false } },
				'data 7 min old'
			],
			[
				`${variant} unavailable`,
				{
					...base,
					variant,
					round: null,
					seconds: null,
					status: { tone: 'warn', minutesOld: null, unavailable: true }
				},
				'chain data unavailable'
			],
			[
				`${variant} neutral`,
				{
					...base,
					variant,
					round: null,
					seconds: null,
					status: { tone: 'neutral', minutesOld: null, unavailable: false }
				},
				'Checking chain…'
			]
		]
	)
];
for (const [name, input, expected] of cases) {
	test(`badge text: ${name}`, () => {
		const text = badgeText(input);
		assert.equal(text, expected);
		assert.doesNotMatch(text, /(?:^|\s)#?0(?:$|\s)|NaN|undefined/);
	});
}
test('freshness badge renders the shared text helper', () => {
	const source = readFileSync(new URL('./FreshnessBadge.svelte', import.meta.url), 'utf8');
	assert.match(source, /\{badgeText\(/);
});
