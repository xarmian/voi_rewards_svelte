// types.ts
export interface Token {
    owner: string;
    ownerNFD: string | unknown;
    contractId: number;
    tokenId: number;
    mintRound: number;
    metadata: Metadata;
    metadataURI: string;
}

export interface Transfer {
    contractId: number;
    tokenId: string;
    from: string;
    to: string;
    round: number;
    transactionId: string;
    timestamp: number;
}

export interface Collection {
    contractId: number;
    totalSupply: number;
    mintRound: number;
    tokens: Token[];
}

export interface Metadata {
    name: string;
    description: string;
    image: string;
    image_integrity: string;
    image_mimetype: string;
    properties: object;
    royalties: string;
}