export interface PeerRecord {
    id: number;
    host_name: string;
    peer_date: string;
    peer_count: number;
    created_at: string;
    updated_at: string;
} 

export interface Account {
    address: string;
    isParticipating: boolean;
    balance: number;
    blocksProduced24h: number;
    expectedBlocksPerDay: number;
    expectedBlocksPerWeek: number;
    expectedBlocksPerMonth: number;
    estimatedRewardsPerDay: number;
    estimatedRewardsPerWeek: number;
    estimatedRewardsPerMonth: number;
}  