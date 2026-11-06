import { describe, expect, it } from 'vitest';
import { logoVisible } from './logoState';

describe('logoVisible', () => {
	it('shows a logo that has not failed', () => {
		expect(logoVisible('https://img.example/a.png', null)).toBe(true);
	});

	it('hides a logo whose own URL failed to load', () => {
		expect(logoVisible('https://img.example/a.png', 'https://img.example/a.png')).toBe(false);
	});

	it('shows a different logo after the previous URL failed', () => {
		expect(logoVisible('https://img.example/b.png', 'https://img.example/a.png')).toBe(true);
	});

	it('hides the logo when there is no URL, whatever failed before', () => {
		expect(logoVisible(undefined, null)).toBe(false);
		expect(logoVisible(undefined, 'https://img.example/a.png')).toBe(false);
		expect(logoVisible('', null)).toBe(false);
	});

	it('shows the first URL again once a different URL has replaced the failed one', () => {
		// A failure is remembered for one URL only: the state records the last failed URL.
		expect(logoVisible('https://img.example/a.png', 'https://img.example/b.png')).toBe(true);
	});
});
