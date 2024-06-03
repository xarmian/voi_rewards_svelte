// types.ts
export interface Token {
	marketData: object | null | undefined;
    owner: string;
    ownerNFD: string | unknown;
    contractId: number;
    tokenId: number;
    mintRound: number;
    metadata: Metadata;
    metadataURI: string;
    approved: string;
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
	firstToken: RawToken;
    contractId: number;
    totalSupply: number;
    mintRound: number;
    tokens: Token[];
}

export interface RawToken {
    owner: string;
    contractId: number;
    tokenId: number;
    "mint-round": number;
    metadata: string;
    metadataURI: string;
    approved: string;
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

export type IProject = {
    id: number;
    title: string;
    description: string;
    type: string;
    url?: string;
    galxe?: string;
    guide?: string;
    twitter?: string;
    quests: IQuest[];
    tracking?: boolean;
    realtime?: boolean;
    status?: string; // 'active' or 'inactive'
};

export type IQuest = {
    id: number;
    name?: string;
    title: string;
    description: string;
    status: null | "todo" | "in-progress" | "done";
    reward: number;
    earned?: number;
    guide?: string;
    frequency?: string; // daily, weekly, monthly, once -- once if undefined
    isOpen?: boolean;
};

