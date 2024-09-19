export interface Quest {
    id: number;
    title: string;
    reward: number;
    project: number;
}

export interface QuestData {
    quest_data: Record<number, number>;
    points_tokens: number;
    totalPoints: number;
    discordMultiplier: number;
    humanMultiplier: number;
    estimatedReward: number;
}

export interface Project {
    id: number;
    title: string;
}