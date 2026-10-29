import {
	retryable,
	sendAndConfirm,
	type Outcome,
	type SendDependencies,
	type TrackedOutcome
} from './sendAndConfirm';

export function sendGroups(
	signedGroups: Uint8Array[][],
	deps: SendDependencies & { onOutcome?: (outcome: Outcome, index: number) => void }
): Promise<Outcome[]> {
	return Promise.all(
		signedGroups.map(async (group, index) => {
			const outcome = await sendAndConfirm(group, deps);
			// Publish each outcome immediately, without waiting for the other groups.
			deps.onOutcome?.(outcome, index);
			return outcome;
		})
	);
}

export function retryRecipients<T>(
	outcomes: readonly (TrackedOutcome | undefined)[],
	recipientsByGroup: readonly (readonly T[])[]
): T[] {
	return retryable(outcomes).flatMap((index) => recipientsByGroup[index] ?? []);
}
