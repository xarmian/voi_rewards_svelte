export interface FungibleTokenType {
    id: string;
    name: string;
    symbol: string;
    balance: number;
    decimals: number;
    verified: boolean;
    imageUrl: string;
    value: number;
    poolId?: string;
    type?: 'vsa' | 'arc200' | 'native';
    poolInfo?: {
        provider?: string;
        tokAType?: string;
        tokAId?: string;
        tokBType?: string;
        tokBId?: string;
    };
    approvals?: TokenApproval[];
    outgoingApprovals?: TokenApproval[];
}

export interface ARC200Token {
    name: string;
    symbol: string;
    creator: string;
    deleted: boolean;
    tokenId: string;
    decimals: number;
    verified: number;
    mintRound: number;
    contractId: number;
    globalState: Map<string, string>;
    totalSupply: string;
}

export interface TokenBalance {
    name: string;
    symbol: string;
    balance: number;
    decimals: number;
    verified: boolean;
    accountId: string;
    contractId: number;
}

export interface TokenApproval {
    owner: string;
    round: number;
    amount: string;
    spender: string;
    timestamp: number;
    contractId: number;
    transactionId: string;
}

export interface LPToken extends FungibleTokenType {
    contractId: string;
    poolInfo: {
        tokAId: string;
        tokBId: string;
        tokASymbol: string;
        tokBSymbol: string;
        tokABalance: string;
        tokBBalance: string;
        tokAType?: string;
        tokBType?: string;
        totalSupply: number;
        poolId: string;
        apr: number;
        tokADecimals: number;
        tokBDecimals: number;
        tvl: number;
        provider: 'humble' | 'nomadex';
    };
}

export interface NFTToken {
    name: string;
    floorPrice?: number;
    ceilingPrice?: number;
    lastSalePrice?: number;
    imageUrl: string;
    tokenId: string;
    contractId: string;
    metadata?: {
        name?: string;
        image?: string;
        description?: string;
    };
    isListed?: boolean;
    listingPrice?: number;
    lastSaleTimestamp?: number;
    owner?: string;
    metadataURI?: string;
    collection?: {
        name?: string;
        totalSupply?: number;
        creator?: string;
    };
}

export interface ASAToken {
    assetId: number;
    amount: number;
    creator: string;
    frozen: boolean;
    name?: string;
    unitName?: string;
    decimals?: number;
    value?: number;
}

export interface UnifiedAsset {
    id: string;
    name: string;
    type: 'NFT' | 'Fungible' | 'ASA' | 'LP';
    balance: number;
    value: number;
    symbol: string;
    imageUrl: string | null;
    contractId: string;
    tokenId?: string;
    poolId?: string;
    frozen?: boolean;
    poolInfo?: {
        tokAId: string;
        tokBId: string;
        tokASymbol: string;
        tokBSymbol: string;
        tokABalance: string;
        tokBBalance: string;
        totalSupply: string;
        poolId: string;
    };
} 