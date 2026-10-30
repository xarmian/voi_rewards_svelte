import { expect, test } from 'vitest';
import { isRetiredExchange } from './retired';

test.each(['nomadex', 'Nomadex', ' NOMADEX '])('%j is retired', (name) => {
	expect(isRetiredExchange(name)).toBe(true);
});

test.each(['humble', 'Humble', 'Tinyman', 'DEX', '', undefined, null, 3])(
	'%j is not retired',
	(name) => {
		expect(isRetiredExchange(name)).toBe(false);
	}
);
