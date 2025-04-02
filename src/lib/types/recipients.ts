export interface Recipient {
    address: string;
    amount: string;
    info: {
        balance: number;
        createdAt: string;
        hasOptedIn: boolean;
        assetBalance?: number;
    } | null;
    isLoading: boolean;
    isValid: boolean;
} 