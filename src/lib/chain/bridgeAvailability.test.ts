import { expect, test } from 'vitest';
import { BRIDGE_ENABLED, hasPendingBridge } from './bridgeAvailability';
import type { PendingSendRecord } from './pendingSends';

const key = (wallet: string) => `voirewards:pending-sends:${wallet}`;
const record = (kind: PendingSendRecord['kind'], wallet: string): PendingSendRecord => ({
	kind,
	wallet,
	txIds: [`${kind}-${wallet}`],
	firstTxId: `${kind}-${wallet}`,
	lastValid: 100,
	recipients: [{ address: 'BRIDGE', amount: '1' }],
	symbol: 'VOI',
	createdAt: 1
});

function storage(saved: Record<string, PendingSendRecord[]>) {
	const values = new Map(
		Object.entries(saved).map(([wallet, list]) => [key(wallet), JSON.stringify(list)])
	);
	return {
		getItem: (name: string) => values.get(name) ?? null,
		setItem: (name: string, value: string) => void values.set(name, value),
		removeItem: (name: string) => void values.delete(name)
	};
}

test('starting a bridge is turned off', () => {
	expect(BRIDGE_ENABLED).toBe(false);
});

test('a bridge record for the wallet counts as pending', () => {
	expect(hasPendingBridge('Y', storage({ Y: [record('send', 'Y'), record('bridge', 'Y')] }))).toBe(
		true
	);
});

test('send records and other wallets do not count', () => {
	const saved = storage({ Y: [record('send', 'Y')], Z: [record('bridge', 'Z')] });
	expect(hasPendingBridge('Y', saved)).toBe(false);
	expect(hasPendingBridge('X', saved)).toBe(false);
	// A record stored under this wallet's key but naming another wallet is not this wallet's bridge.
	expect(hasPendingBridge('Y', storage({ Y: [record('bridge', 'Z')] }))).toBe(false);
});

test('storage that throws counts as no pending bridge', () => {
	const failing = {
		getItem: () => {
			throw new Error('denied');
		},
		setItem: () => {},
		removeItem: () => {}
	};
	expect(hasPendingBridge('Y', failing)).toBe(false);
});
