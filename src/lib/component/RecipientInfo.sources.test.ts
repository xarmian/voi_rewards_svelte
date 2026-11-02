import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const components = ['RecipientRow.svelte', 'SendTokenModal.svelte'].map((file) => ({
	file,
	source: readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
}));

test.each(components)(
	'$file removes indexer recipient lookups and fabricated defaults',
	({ source }) => {
		expect(
			source,
			'Recipient info must not depend on indexer account or block lookups'
		).not.toMatch(/lookupAccountByID|lookupBlock/);
		expect(source, 'Lookup failures must not become zero balances or creation dates').not.toMatch(
			/\{\s*amount:\s*0,\s*assets:\s*\[\]\s*\}|Date\.now\(\)\s*\/\s*1000/
		);
	}
);

test.each(components)('$file imports and calls the shared recipient loader', ({ source }) => {
	expect(source, 'Import loadRecipientInfo from the shared chain module').toMatch(
		/import\s*\{[^}]*\bloadRecipientInfo\b[^}]*\}\s*from\s*['"]\$lib\/chain\/recipientInfo['"]/
	);
	expect(source, 'Delegate the recipient lookup to loadRecipientInfo').toMatch(
		/await\s+loadRecipientInfo\(/
	);
});

test.each(components)(
	'$file explains that unavailable recipient info blocks sending',
	({ source }) => {
		expect(source, 'Use the required recipient lookup failure message').toContain(
			"Couldn't check this recipient. Sending is blocked until it can be checked."
		);
	}
);

test.each(components)(
	'$file marks recipients valid only after a loaded result',
	({ file, source }) => {
		if (file === 'SendTokenModal.svelte') {
			expect(source, 'Delegate validity to the tested lookup application helper').toMatch(
				/import\s*\{[^}]*\bapplyRecipientLookup\b[^}]*\}\s*from\s*['"]\$lib\/chain\/recipientInfo['"]/
			);
			expect(source, 'Only the shared helper may mark modal recipients valid').not.toMatch(
				/\.isValid\s*=\s*true/
			);
			return;
		}
		const assignments = [...source.matchAll(/\.isValid\s*=\s*true/g)];
		expect(assignments, 'Keep the successful recipient validation assignment').toHaveLength(1);
		for (const assignment of assignments) {
			expect(
				source.slice(Math.max(0, assignment.index - 400), assignment.index),
				'Only a status === loaded branch may mark a recipient valid'
			).toMatch(/status\s*===\s*['"]loaded['"]/);
		}
	}
);

test('RecipientRow offers Retry in the lookup failure branch and guards all recipient values', () => {
	const template = components[0].source.split('</script>')[1];
	expect(
		template,
		'Recipient details require a selected address and must wait for loading'
	).toMatch(/\{#if recipient\.address\}[\s\S]*?\{#if recipient\.isLoading\}/);
	const failure = template.match(
		/\{:else if !recipient\.info && recipient\.lookupError\}([\s\S]*?)\{:else if recipient\.info\}/
	)?.[1];
	expect(failure, 'Render an explicit lookup failure branch before the info branch').toBeDefined();
	expect(failure).toContain("Couldn't check this recipient.");
	expect(failure, 'Retry must check the selected recipient again').toMatch(
		/<button\b[^>]*on:click=\{\(\) => recipient\.address && fetchRecipientInfo\(recipient\.address\)\}[^>]*>\s*Retry\s*<\/button>/
	);
	expect(failure, 'A failed lookup must not show balances or an opt-in badge').not.toMatch(
		/recipient\.info\.|Balance:|Opted In/
	);
	const infoBranch = template.indexOf('{:else if recipient.info}');
	const values = [...template.matchAll(/recipient\.info\.(?:balance|assetBalance|hasOptedIn)/g)];
	expect(
		values,
		'Keep the recipient balances and opt-in status behind recipient.info'
	).toHaveLength(3);
	for (const value of values) {
		expect(value.index, 'Recipient values must follow the recipient.info guard').toBeGreaterThan(
			infoBranch
		);
	}
});

test('Recipient info has lookupError and no unused creation date', () => {
	const source = readFileSync(new URL('../types/recipients.ts', import.meta.url), 'utf8');
	expect(source, 'Remove the unused recipient creation date').not.toMatch(/\bcreatedAt\b/);
	expect(source, 'Track recipient lookup failures separately from recipient info').toMatch(
		/lookupError\?\s*:\s*string\s*\|\s*null/
	);
});

test.each(components)(
	'$file clears previous validation before checking a recipient',
	({ file, source }) => {
		if (file === 'SendTokenModal.svelte') {
			const invalidation = source.match(/\tfunction invalidateRows\([^]*?\n\t\}/)?.[0];
			for (const field of ['isValid: false', 'info: null', 'lookupError: null']) {
				expect(invalidation).toContain(field);
			}
			return;
		}
		const body = source.match(/\tasync function fetchRecipientInfo\([^]*?\n\t\}/)?.[0];
		expect(body).toBeDefined();
		const lookup = body!.indexOf('await loadRecipientInfo(');
		const beforeLookup = body!.slice(0, lookup);
		expect(lookup).toBeGreaterThan(-1);
		expect(beforeLookup).toMatch(/\.isValid\s*=\s*false/);
		expect(beforeLookup).toMatch(/\.info\s*=\s*null/);
		expect(beforeLookup).toMatch(/\.lookupError\s*=\s*null/);
	}
);

test.each(components)(
	'$file drops stale recipient results before marking valid',
	({ file, source }) => {
		const body = source.match(/\tasync function fetchRecipientInfo\([^]*?\n\t\}/)?.[0];
		expect(body).toBeDefined();
		const lookup = body!.indexOf('await loadRecipientInfo(');
		if (file === 'SendTokenModal.svelte') {
			const apply = body!.indexOf('applyRecipientLookup(');
			expect(lookup, 'Keep the shared recipient loader').toBeGreaterThan(-1);
			expect(apply, 'Apply recipient validation through the pure helper').toBeGreaterThan(lookup);
			expect(
				body!.slice(lookup, apply),
				'Drop results for the previous token before applying them'
			).toMatch(/if\s*\(tokenKey\(selectedToken\)\s*!==\s*\w+\)\s*return/);
			expect(body, 'Validity is assigned only by applyRecipientLookup').not.toMatch(
				/\.isValid\s*=\s*true/
			);
			return;
		}
		const valid = body!.indexOf('.isValid = true');
		expect(lookup).toBeGreaterThan(-1);
		expect(valid).toBeGreaterThan(lookup);
		expect(body!.slice(lookup, valid)).toMatch(
			/if\s*\(\s*!\(\s*recipient\.lookupId\s*===\s*ticket\s*&&\s*recipient\.address\s*===\s*address\b[^]*?\)\s*\)\s*return/
		);
	}
);
