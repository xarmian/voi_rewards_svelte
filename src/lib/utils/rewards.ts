interface RewardCalculations {
    expectedBlocksPerDay: number;
    expectedBlocksPerWeek: number;
    expectedBlocksPerMonth: number;
    estimatedRewardsPerDay: number;
    estimatedRewardsPerWeek: number;
    estimatedRewardsPerMonth: number;
    averageBlockTime: number;
}

export function calculateRewards(balance: number, onlineMoney: number, voiPerBlock: number): RewardCalculations {
    const secondsPerDay = 24 * 60 * 60;
    const blocksPerDay = secondsPerDay / 2.8; // Assuming 2.8 seconds per block
    
    // Calculate expected blocks
    const expectedBlocksPerDay = (balance / onlineMoney) * blocksPerDay;
    const expectedBlocksPerWeek = expectedBlocksPerDay * 7;
    const expectedBlocksPerMonth = expectedBlocksPerDay * 30;

    // Calculate rewards
    const estimatedRewardsPerDay = expectedBlocksPerDay * voiPerBlock;
    const estimatedRewardsPerWeek = expectedBlocksPerWeek * voiPerBlock;
    const estimatedRewardsPerMonth = expectedBlocksPerMonth * voiPerBlock;

    // Calculate average block time
    const averageBlockTime = secondsPerDay / expectedBlocksPerDay;

    return {
        expectedBlocksPerDay,
        expectedBlocksPerWeek,
        expectedBlocksPerMonth,
        estimatedRewardsPerDay,
        estimatedRewardsPerWeek,
        estimatedRewardsPerMonth,
        averageBlockTime
    };
} 