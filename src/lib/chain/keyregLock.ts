// Keyregs that were sent but may not have landed, by keyreg account (the keyreg sender: the wallet,
// or a staking contract's application address). Module state, so a lock outlives the modal closing
// and reopening: while one is held, sending another keyreg for that account could register twice.
// A transaction cannot land after its last valid round, so the lock ends there.

export type KeyregLock = { account: string; txid: string; lastValid: number };

const locks = new Map<string, KeyregLock>();

export function lockKeyreg(account: string, txid: string, lastValid: number | bigint): KeyregLock {
	const lock = { account, txid, lastValid: Number(lastValid) };
	locks.set(account, lock);
	return lock;
}

// The lock while `round` is at or before its last valid round. Past it, the lock is dropped. An
// unknown round keeps the lock: it cannot be shown to have ended.
export function activeKeyregLock(
	account: string,
	round: number | bigint | undefined
): KeyregLock | null {
	const lock = locks.get(account);
	if (!lock) return null;
	if (round === undefined || Number(round) <= lock.lastValid) return lock;
	locks.delete(account);
	return null;
}

// Tests only.
export function resetKeyregLocks(): void {
	locks.clear();
}

// The messages Check again owns: the one-click's refusal while a lock holds, and Check again's own
// failed read. Check again replaces or clears only these, never a message from another action.
export const KEYREG_LOCKED_MESSAGE =
	'An earlier registration for this account may still go through, so nothing was sent. Check it in the explorer before trying again.';
export const RECHECK_FAILED_MESSAGE = "Couldn't read this account from the network. Try again.";
