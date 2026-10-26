import type { DataState, Tone } from '$lib/ds';

// Literal excerpts from phase1/data/snapshot.json; no runtime dependency on that file.
export const network = {
	price: 0.00012700904447768808,
	change24h: -1.0110437890973163,
	online_stake: 725243947.167079,
	online_accounts: 152,
	apr: 16.037916132129265,
	blocks: 126874,
	projected_blocks: 216074,
	epoch: 104,
	elapsed_days: 4.110243055555555
};
export const asOf = '2026-10-25T02:38:47Z';
export const aprHistory = [
	18.986746357235294, 17.452206748865574, 17.3927054302752, 17.67838873269282, 17.184991288244596,
	17.413533370534793, 17.630173482898556, 21.21158518914595, 17.49163159557074, 17.60877819117091,
	17.43773121189828, 17.303631528247337, 17.18567025390595, 17.21703122998493, 20.701615103586832,
	16.6396590439747, 16.558635146475716, 16.44343772719136, 16.393186622838464, 16.531977746213922,
	16.463230575435215, 16.331690276672656, 16.502102222874655, 16.348282177024025, 16.04577141286866,
	16.037916132129265
];
export const wallet = {
	owner: 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ',
	contracts: [
		{
			id: 36907,
			online: true,
			key_days: 304.3234435797665,
			last_vote: '10/25/2026, 2:41:39 AM'
		},
		{
			id: 36914,
			online: true,
			key_days: 304.33002594033724,
			last_vote: '10/25/2026, 2:41:25 AM'
		},
		{
			id: 36922,
			online: true,
			key_days: 304.3365110246433,
			last_vote: '10/25/2026, 2:41:27 AM'
		},
		{
			id: 284752,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 40441,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 49845,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 52003,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 284668,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 39103,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 429162,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 417216,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 41674,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 450282,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 101152,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 400429,
			online: false,
			key_days: null,
			last_vote: null
		},
		{
			id: 406876,
			online: false,
			key_days: null,
			last_vote: null
		}
	]
};

export const onlineCount = wallet.contracts.filter((contract) => contract.online).length;
export const offlineCount = wallet.contracts.length - onlineCount;
export const states: DataState[] = ['loading', 'ready', 'empty', 'stale', 'error'];
export const tones: Tone[] = ['ok', 'warn', 'danger', 'neutral', 'info'];
export const statusLabels: Record<Tone, string> = {
	ok: 'Online',
	warn: 'Idle',
	danger: 'Offline',
	neutral: 'Not staking',
	info: 'Live'
};
export const sizes = ['sm', 'md'] as const;
export const buttonVariants = ['primary', 'soft', 'ghost'] as const;
export const sparklineTones = ['accent', 'hi', 'ok'] as const;
export const ringTones = ['ok', 'warn', 'danger'] as const;
export const chipTones = ['accent', ...tones] as const;
export const cardSpans = [3, 4, 5, 6, 7, 8, 12] as const;

// The snapshot has no expiring keys. These values illustrate the wallet thresholds.
export const syntheticHealth = {
	keys: [12, 3, -1].map((keyDays) => ({
		keyDays,
		tone: (keyDays < 7 ? 'danger' : keyDays < 30 ? 'warn' : 'ok') as Tone,
		title: keyDays <= 0 ? 'Key expired' : `Key expires in ${keyDays} d`
	})),
	votes: [25, 120].map((minutes) => ({
		minutes,
		tone: (minutes > 60 ? 'danger' : minutes > 10 ? 'warn' : 'ok') as Tone,
		title: minutes >= 60 ? `Last vote ${minutes / 60} h ago` : `Last vote ${minutes} min ago`
	}))
};
