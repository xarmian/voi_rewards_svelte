import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface EpochData {
    epoch_number: number;
    epoch_start: string;
    epoch_end: string;
    reward: number;
    online_stake: number;
    ballast_stake: number;
    eligible_online_stake: number;
    apr: number;
}

interface EpochResponse {
    epochs: EpochData[];
    current_epoch: number;
}

export const GET: RequestHandler = async () => {
    try {
        const response = await fetch('https://api.voirewards.com/proposers/index_main_3.php?action=epoch-detail');
        if (!response.ok) {
            throw new Error('Failed to fetch epoch data');
        }
        const data: EpochResponse = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error fetching epoch data:', error);
        return json({ error: 'Failed to fetch epoch data' }, { status: 500 });
    }
}; 