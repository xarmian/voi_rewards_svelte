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
    type?: 'vsa' | 'arc200';
}

export interface LPToken {
    id: string;
    name: string;
    symbol: string;
    balance: number;
    decimals: number;
    verified: boolean;
    imageUrl: string;
    poolId: string;
    value: number;
    poolInfo: {
        tokAId: string;
        tokBId: string;
        tokASymbol: string;
        tokBSymbol: string;
        tokABalance: string;
        tokBBalance: string;
        tokADecimals: number;
        tokBDecimals: number;
        totalSupply: string;
        poolId: string;
        apr: number;
        tvl: number;
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