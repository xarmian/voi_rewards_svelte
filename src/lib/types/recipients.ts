export interface Recipient {
	address: string | null;
	amount: string;
	note?: string;
	info: {
		balance: number;
		hasOptedIn: boolean;
		assetBalance?: number;
	} | null;
	isLoading: boolean;
	lookupId?: number;
	isValid: boolean;
	lookupError?: string | null;
}
