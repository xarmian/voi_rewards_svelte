import { beforeEach, describe, expect, it } from 'vitest';
import { activeKeyregLock, lockKeyreg, resetKeyregLocks } from './keyregLock';

describe('keyregLock', () => {
	beforeEach(() => resetKeyregLocks());

	it('holds nothing for an account never locked', () => {
		expect(activeKeyregLock('A', 100)).toBeNull();
	});

	it('holds a lock through its last valid round', () => {
		expect(lockKeyreg('A', 'TX1', 200n)).toEqual({ account: 'A', txid: 'TX1', lastValid: 200 });
		expect(activeKeyregLock('A', 100)).toEqual({ account: 'A', txid: 'TX1', lastValid: 200 });
		expect(activeKeyregLock('A', 200n)).toEqual({ account: 'A', txid: 'TX1', lastValid: 200 });
	});

	it('drops the lock once the round passes its last valid round', () => {
		lockKeyreg('A', 'TX1', 200);
		expect(activeKeyregLock('A', 201)).toBeNull();
		// Dropped, not just hidden: an earlier round no longer finds it.
		expect(activeKeyregLock('A', 100)).toBeNull();
	});

	it('keeps the lock when the round is unknown', () => {
		lockKeyreg('A', 'TX1', 200);
		expect(activeKeyregLock('A', undefined)).toMatchObject({ txid: 'TX1' });
	});

	it('locks each account separately', () => {
		lockKeyreg('A', 'TX1', 200);
		expect(activeKeyregLock('B', 100)).toBeNull();
		lockKeyreg('B', 'TX2', 300);
		expect(activeKeyregLock('A', 250)).toBeNull();
		expect(activeKeyregLock('B', 250)).toMatchObject({ txid: 'TX2' });
	});

	it('a later send replaces the account lock', () => {
		lockKeyreg('A', 'TX1', 200);
		lockKeyreg('A', 'TX2', 400);
		expect(activeKeyregLock('A', 300)).toMatchObject({ txid: 'TX2', lastValid: 400 });
	});

	it('reset clears every lock', () => {
		lockKeyreg('A', 'TX1', 200);
		resetKeyregLocks();
		expect(activeKeyregLock('A', 100)).toBeNull();
	});
});
