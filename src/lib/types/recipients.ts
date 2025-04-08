export interface Recipient {
    address: string | null;
    amount: string;
    note?: string;
    info: {
        balance: number;
        createdAt: string;
        hasOptedIn: boolean;
        assetBalance?: number;
    } | null;
    isLoading: boolean;
    isValid: boolean;
}
