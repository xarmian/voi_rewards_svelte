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

export interface IProject {
    id: number;
    title: string;
    description: string;
    category: string;
    type: string;
    url?: string;
    galxe?: string;
    guide?: string;
    twitter?: string;
    quests: IQuest[];
    tracking?: boolean;
    realtime?: boolean;
    status?: string; // 'active' or 'inactive'
    logo?: string;
    new?: boolean;
}

export type IQuest = {
    id: number;
    name?: string;
    title: string;
    description: string;
    status: null | "todo" | "in-progress" | "done";
    reward: number;
    earned?: number;
    complete_epoch?: boolean;
    guide?: string;
    frequency?: string; // daily, weekly, monthly, once -- once if undefined
    isOpen?: boolean;
};

export interface LockContract {
    contractId: number;
    contractAddress: string;
    creator: string;
    createRound: number;
    lastSyncRound: number;
    global_funder: string; // address of funder
    global_funding: number; // funding amount
    global_owner: string; // address of owner
    global_period: number; // number of periods (global_period_seconds * global_lockup_delay) of locking
    global_total: string; // total amount of tokens ?
    global_period_seconds: number; // number of seconds per lockup_delay
    global_lockup_delay: number; // divisor of a period
    global_vesting_delay: number;
    global_period_limit: number; // max number of periods to lock
    global_delegate: string; // address of delegate
    global_deployer: string; // address of deployer
    global_parent_id: number; // id of parent
    global_messenger_id: number; // id of messenger
    global_initial: string; // initial amount of tokens
    global_deadline: number; // deadline to configure lock period
    global_distribution_count: number; // number of distributions
    global_distribution_seconds: number; // number of seconds per distribution
    part_vote_k: string;
    part_sel_k: string;
    part_vote_fst: number;
    part_vote_lst: number;
    part_vote_kd: number;
    part_sp_key: string;
    deleted: null;
}
