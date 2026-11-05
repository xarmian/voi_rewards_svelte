export type SelectedAccount = { address?: string; app?: string } | null | undefined;

export function canSignFor(
	selected: SelectedAccount,
	accountAddress: string | null | undefined
): boolean {
	return (
		!!accountAddress &&
		selected?.address === accountAddress &&
		selected?.app !== '' &&
		selected?.app !== 'Watch'
	);
}

export function signerMatchesAccount(
	signer: { address: string },
	accountAddress: string | null | undefined
): boolean {
	return !!accountAddress && signer.address === accountAddress;
}

export function wrongSignerMessage(accountAddress: string | null | undefined): string {
	return accountAddress
		? `Select account ${accountAddress} in a signing wallet to continue.`
		: 'Select the account this page shows in a signing wallet to continue.';
}
