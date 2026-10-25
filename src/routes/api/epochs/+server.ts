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
		const response = await fetch(
			'https://api.voirewards.com/proposers/index_main_3.php?action=epoch-detail'
		);
		if (!response.ok) {
			throw new Error('Failed to fetch epoch data');
		}
		const data: EpochResponse = await response.json();
		return json({
			...data,
			epochs: (Array.isArray(data.epochs) ? data.epochs : []).map((epoch) => ({
				...epoch,
				epoch_number: Number(epoch.epoch_number),
				reward: Number(epoch.reward),
				online_stake: Number(epoch.online_stake),
				ballast_stake: Number(epoch.ballast_stake),
				eligible_online_stake: Number(epoch.eligible_online_stake),
				apr: Number(epoch.apr)
			})),
			current_epoch: Number(data.current_epoch)
		});
	} catch (error) {
		console.error('Error fetching epoch data:', error);
		return json({ error: 'Failed to fetch epoch data' }, { status: 500 });
	}
};
