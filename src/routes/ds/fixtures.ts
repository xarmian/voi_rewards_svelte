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

// C2 table fixtures copied literally from phase1/data/snapshot.json.
export const proposers = [
	{
		rank: 1,
		addr: 'QKCTN6IX3TFNGN6LXSBNQQERXZUUXNDRTQWDTQBMHBZOTXLYJCEABU6ZX4',
		name: null,
		blocks: 44014,
		share: 0.3469111086589845,
		est_reward: 455634.9552097893
	},
	{
		rank: 2,
		addr: 'ARAMIDFJYV2TOFB5MRNZJIXBSAVZCVAUDAPFGKR5PNX4MTILGAZABBTXQQ',
		name: null,
		blocks: 22127,
		share: 0.17440137459211502,
		est_reward: 229059.72313189003
	},
	{
		rank: 3,
		addr: 'H4F46WCUMJBTVCW7P466RJJBTETOKOQR43YALSWXA5DUPEKWTFGABNBILA',
		name: null,
		blocks: 18877,
		share: 0.14878540914608193,
		est_reward: 195415.57344243178
	},
	{
		rank: 4,
		addr: 'KEHBBPFOY4YA732JEWFJRDYRFN7UACAN2B5FUKSEFOUU3XPOOXJGMLMD5U',
		name: null,
		blocks: 4532,
		share: 0.03572047858505289,
		est_reward: 46915.472736192234
	},
	{
		rank: 5,
		addr: 'BZSZGHMAFQLRWCOFQSMWQRAIFXGR6IKLTU7WNGOLEYRJTQWUEWERIKV5QY',
		name: null,
		blocks: 4096,
		share: 0.03228399829752353,
		est_reward: 42401.98065477568
	},
	{
		rank: 6,
		addr: 'FZPGANXMQIHVSWYN6ZXS63QO5A5X4LEYCB4O52IP37HR6LY5RJY6FRC3LA',
		name: 'corn.voi',
		blocks: 3848,
		share: 0.03032930308810316,
		est_reward: 39834.67323231856
	},
	{
		rank: 7,
		addr: 'R7TBR3Y5QCM6Y2OPQP3BPNUQG7TLN75IOC2WTNRUKO4VPNSDQF52MZB4ZE',
		name: 'xarmian.voi',
		blocks: 3268,
		share: 0.025757838485426485,
		est_reward: 33830.486518507554
	},
	{
		rank: 8,
		addr: 'URTQDGMOXFRWV5T5DEU4TWMLCE7GFN7STKACMKN4K7C27PNJOG4KD2NTII',
		name: null,
		blocks: 3265,
		share: 0.025734192978860915,
		est_reward: 33799.43038033267
	},
	{
		rank: 9,
		addr: 'IX3ZPAWOIDIGDFT3DSUDOC76ZPYWRX7DHQECWS2OJBV2WMSY3THB3ZCUQI',
		name: null,
		blocks: 3244,
		share: 0.025568674432901933,
		est_reward: 33582.037413108475
	},
	{
		rank: 10,
		addr: 'ODCM3IWPLXAKSWGLNWOXO7YK2ZXGKCKF7MY2DAEROSRB2YIF3AJU7SXDPE',
		name: null,
		blocks: 3048,
		share: 0.024023834670618093,
		est_reward: 31553.036385682684
	},
	{
		rank: 11,
		addr: 'W63BNB7XCRGZETCFMVVY36VHETRPFDDW7YNS7TZDBWLFZXYJBIBBEADFSI',
		name: null,
		blocks: 3001,
		share: 0.023653388401090845,
		est_reward: 31066.490220942826
	},
	{
		rank: 12,
		addr: 'M6LSSFHG6BY7Z6CDVURRFHHKPMB7MHB7H7JILX2QW7UB2B6I76ORLPPNMQ',
		name: null,
		blocks: 2076,
		share: 0.01636269054337374,
		est_reward: 21490.847617020096
	},
	{
		rank: 13,
		addr: 'A4KEV44PN6NX5R2FHQZTRCAZ6QCVARO3N7EK6STLV73FKH2AH2BGLAW25I',
		name: null,
		blocks: 1310,
		share: 0.010325204533631793,
		est_reward: 13561.180336366246
	},
	{
		rank: 14,
		addr: '67VTGORLEYOBBW4YENVYURR7ILENL6OBT4ZE7GY4TI7AAG5JPVWBOQRNWY',
		name: null,
		blocks: 1152,
		share: 0.009079874521178493,
		est_reward: 11925.55705915566
	},
	{
		rank: 15,
		addr: 'KSMGUNSX2IWGPZUHU5GPLLD7762T3KUKTPQZXCKNTVMSNZNKQ6RA37AYPI',
		name: null,
		blocks: 1151,
		share: 0.009071992685656637,
		est_reward: 11915.205013097366
	},
	{
		rank: 16,
		addr: '2RMPWZ6VDF5FKNIWLQQRJFMIXRCOML5NWB2XBLIUOVPQCW56F7VTUQCMAU',
		name: 'gov.voi',
		blocks: 1014,
		share: 0.007992181219162318,
		est_reward: 10496.974703110973
	},
	{
		rank: 17,
		addr: '2AWKWKA64Z5QCZFO35N45KTAKZ7HPPPI4FLAZUET5RA5TBK27YNO7WCSBU',
		name: null,
		blocks: 789,
		share: 0.006218768226744644,
		est_reward: 8167.764339994632
	},
	{
		rank: 18,
		addr: 'BUD2763FMK6EYVKGHWWUN4QKHPSPCVFUEPPI4PQCPGYVPGQ6GNKBX6IXCQ',
		name: null,
		blocks: 581,
		share: 0.004579346438198528,
		est_reward: 6014.538759869304
	},
	{
		rank: 19,
		addr: 'MUTS5EI5IYSNNM2QDLNPBJ2NNRSRRMUC4S6OTCXM3JZMHUAJOSJT6YUKRA',
		name: 'voiager.voi',
		blocks: 549,
		share: 0.004327127701499125,
		est_reward: 5683.2732860038695
	},
	{
		rank: 20,
		addr: 'BGO4KGSBK6J33YX4HB245R4QGD73WUI7UMXMPPFFKDY5CXSXVW4ZUAYMEQ',
		name: null,
		blocks: 424,
		share: 0.0033418982612670838,
		est_reward: 4389.267528717014
	},
	{
		rank: 21,
		addr: 'OOOQETQ56ZLPXIHQT2EAGFSC6VRQN2QTJWUDCVAWHYA6GHDHAG5UMHYLQM',
		name: null,
		blocks: 356,
		share: 0.0028059334457808532,
		est_reward: 3685.3283967529646
	},
	{
		rank: 22,
		addr: 'ALGONAUTSPIUHDCX3SLFXOFDUKOE4VY36XV4JX2JHQTWJNKVBKPEBQACRY',
		name: null,
		blocks: 264,
		share: 0.0020808045777700713,
		est_reward: 2732.9401593898388
	},
	{
		rank: 23,
		addr: 'NOOBCIJETEMWKOKEHA6M25KJFHIZDHAKSLWHKQEL7BUJ573E6FY33JDU2A',
		name: null,
		blocks: 255,
		share: 0.002009868058073364,
		est_reward: 2639.771744865185
	},
	{
		rank: 24,
		addr: '4WS6PXHM2CCS2Y3MWWIFI3XDE7IUTH47TXBEFCJAVLLMITG3OJOOCELWLE',
		name: null,
		blocks: 254,
		share: 0.002001986222551508,
		est_reward: 2629.41969880689
	},
	{
		rank: 25,
		addr: 'RNKC72UKE535HMN2XIBDI2RURW6KRX3BG5CCXEKCABVQM5WFVTCQ5DZCIQ',
		name: null,
		blocks: 249,
		share: 0.0019625770449422262,
		est_reward: 2577.6594685154164
	},
	{
		rank: 26,
		addr: '5L7J24SLGMYCOXGLE7WEHY76LRFKABOZNUSQDRXKJQYSYUO5KBIM3LCHX4',
		name: 'waterzilla.voi',
		blocks: 249,
		share: 0.0019625770449422262,
		est_reward: 2577.6594685154164
	},
	{
		rank: 27,
		addr: '3C7LRMA3U4TL6WBGSVEPBZ4TOA7M5NLAPE4BSYX3RBS3FVRGC73MYK3MPQ',
		name: null,
		blocks: 211,
		share: 0.0016630672951116856,
		est_reward: 2184.281718300212
	},
	{
		rank: 28,
		addr: 'RETURN4OG4JOC6GI5DRMKQ45HVNZHAFF4H7525UFGDFC33M2S7FDJMQJKU',
		name: 'return4.voi',
		blocks: 198,
		share: 0.0015606034333275533,
		est_reward: 2049.705119542379
	},
	{
		rank: 29,
		addr: 'NYDIDNITM72GYZUQAWWUFY3XISJWV6V7SXKFEHS56VC7I7E5RBOZI7C6JU',
		name: null,
		blocks: 198,
		share: 0.0015606034333275533,
		est_reward: 2049.705119542379
	},
	{
		rank: 30,
		addr: 'QRK6CD6M7LR7WPLXFNJGICNYOWICHOFW3HH3A5WCJSYEOSFLDLS2FGZ35A',
		name: null,
		blocks: 165,
		share: 0.0013005028611062944,
		est_reward: 1708.0875996186494
	},
	{
		rank: 31,
		addr: 'GC7CLH2I6WR3BLDQHRQ2YFGOIDEICFFH7RLFD2TIBZFYCWRECNHJTWWTMM',
		name: 'hattyhats.voi',
		blocks: 130,
		share: 0.0010246386178413228,
		est_reward: 1345.7659875783297
	},
	{
		rank: 32,
		addr: 'PQGSWSSGQMK3HGT4OQFVL6G37JLSHR2GY7BY5U75BR3GEU7Z5YQWZU2AUA',
		name: null,
		blocks: 119,
		share: 0.0009379384271009033,
		est_reward: 1231.8934809370865
	},
	{
		rank: 33,
		addr: 'EUSKXVC6SAZ5226QJCJDNYYCUJY4NCU2FM4MXEORTZCDIWNXKEYZ3LHXFA',
		name: null,
		blocks: 112,
		share: 0.0008827655784479089,
		est_reward: 1159.4291585290225
	},
	{
		rank: 34,
		addr: '3YETMQMS2OISZFP7ZHL6QRFCXCOAJNQPHDUXII4FGEQKAGQIN2A2JBZTAA',
		name: null,
		blocks: 108,
		share: 0.0008512382363604836,
		est_reward: 1118.0209742958432
	},
	{
		rank: 35,
		addr: 'ZWES7RROIBRLGZGAFXPUA2RJ2RKN2ZPJIIU25FOPEQBDJYNCADBGA7W6OQ',
		name: null,
		blocks: 104,
		share: 0.0008197108942730584,
		est_reward: 1076.6127900626639
	},
	{
		rank: 36,
		addr: 'XKTKTIKSPKYPNEVFJ6UCPDK23NHGOU5VGQPKNYWT5QDKHI74VBDZE6LTDQ',
		name: null,
		blocks: 104,
		share: 0.0008197108942730584,
		est_reward: 1076.6127900626639
	},
	{
		rank: 37,
		addr: 'EPAQ5RMLYIPJOEAALOIIOT2AVOWBFATDI2RYVTCQD6PZ2SRFG5VAKBUSK4',
		name: null,
		blocks: 103,
		share: 0.000811829058751202,
		est_reward: 1066.260744004369
	},
	{
		rank: 38,
		addr: 'LXWHVDE52P4Q7KERP2MASLXVPDPCUADL6JI76HDKDSKRLBHD7JOKAPIABM',
		name: null,
		blocks: 92,
		share: 0.0007251288680107823,
		est_reward: 952.3882373631257
	},
	{
		rank: 39,
		addr: 'LRSUSI3IRQKI6QJTYBJWU6HHVUMEKPR653UNGHIAK4Q765NMBLAJOFSWCI',
		name: null,
		blocks: 83,
		share: 0.0006541923483140753,
		est_reward: 859.219822838472
	},
	{
		rank: 40,
		addr: 'C46D7INVWU4U2CPOE5NVZT6ZB5NWOLU57U6BDTRFGEDWRKHTT7SPG3JTCA',
		name: null,
		blocks: 74,
		share: 0.0005832558286173684,
		est_reward: 766.0514083138185
	},
	{
		rank: 41,
		addr: 'MJ7UXEELSYC3LP6BZINUTHAX3LP33FFU7GT33GSI6M2OPO33OZSRAPKZIY',
		name: null,
		blocks: 65,
		share: 0.0005123193089206614,
		est_reward: 672.8829937891649
	},
	{
		rank: 42,
		addr: 'KEWXZZ5NTVGRNG4Z3E4XL7QXKTP656QZIYYIAO3YGSGBKHPDE2KFE4XDVQ',
		name: null,
		blocks: 60,
		share: 0.0004729101313113798,
		est_reward: 621.1227634976907
	},
	{
		rank: 43,
		addr: 'BQ6FDNZ7OB5OZTYVH7UJWYD5UZRKT6SCZ5XKJ4R56Z22SCCF3OW3Z3VG5Q',
		name: null,
		blocks: 60,
		share: 0.0004729101313113798,
		est_reward: 621.1227634976907
	},
	{
		rank: 44,
		addr: 'SGY55W3DA7ZEBJOOQFB4ARLGFBMHP5ZCV3TLAY4PYVA6NOE2BDN57WCRSU',
		name: null,
		blocks: 58,
		share: 0.00045714646026766715,
		est_reward: 600.4186713811009
	},
	{
		rank: 45,
		addr: 'N6MOAOGIWIGB2UJHPLVF3BMBYVYBSCQ6F7MQ6U4CCWBSJM4TCTLZB2QR4Y',
		name: null,
		blocks: 48,
		share: 0.00037832810504910384,
		est_reward: 496.8982107981525
	},
	{
		rank: 46,
		addr: 'CW44JRNRMO4K26JIKROZQZXQ626I46JO7IKFZ2YMOT6M3PZTIJZCUADZ5Q',
		name: null,
		blocks: 42,
		share: 0.00033103709191796587,
		est_reward: 434.78593444838344
	},
	{
		rank: 47,
		addr: 'HLTLJ5W47GLNOG5EEXPYZCVSK5MUHFUKBHA2L2PZZGZIT33GNTREZ2AUXY',
		name: null,
		blocks: 40,
		share: 0.0003152734208742532,
		est_reward: 414.0818423317938
	},
	{
		rank: 48,
		addr: 'GNEHXZDDDKFEVUSGC5PPNWHWQT4YSZO6KLDI4SR5BYXH5J2DBVQIJ65YUI',
		name: null,
		blocks: 38,
		share: 0.00029950974983054054,
		est_reward: 393.37775021520406
	},
	{
		rank: 49,
		addr: 'C4SIBJGPHLXNRCNJFXLJ3NUPPOJ66U5O3CTCFMUGMMTKKCNOEQPHNWT6QY',
		name: null,
		blocks: 37,
		share: 0.0002916279143086842,
		est_reward: 383.0257041569092
	},
	{
		rank: 50,
		addr: 'CREPE2LPXG7ATFOBJC4RADFEDOQI4N6BWA5YPFE5JKWMHG7PVYNEQETHGU',
		name: 'bcyc.voi',
		blocks: 36,
		share: 0.0002837460787868279,
		est_reward: 372.6736580986144
	},
	{
		rank: 51,
		addr: 'PNVSXTXFB4P5IXIOTMMEKP46HA5FPIGABHEY52APLNZO6E35ZQFOGRVWMQ',
		name: null,
		blocks: 35,
		share: 0.00027586424326497155,
		est_reward: 362.32161204031956
	},
	{
		rank: 52,
		addr: 'SGLHEZJULD3QM7GUNXR43PW2ZXEEL4S4XDBC474YZPKTRVYDA4TVGZCITM',
		name: null,
		blocks: 30,
		share: 0.0002364550656556899,
		est_reward: 310.56138174884535
	},
	{
		rank: 53,
		addr: 'MJR7GQHH6C7IE6TFP3CXVPVFUK45YMY7HYHPIMAXEZ424U2UR3MP53ML5A',
		name: null,
		blocks: 29,
		share: 0.00022857323013383357,
		est_reward: 300.20933569055046
	},
	{
		rank: 54,
		addr: 'TNBABD63I7N4RJ5DYEY7XPWDOO3FERJZUVGE3VKB2PADKOHDKPJVXSJWPM',
		name: null,
		blocks: 28,
		share: 0.00022069139461197723,
		est_reward: 289.85728963225563
	},
	{
		rank: 55,
		addr: 'ALPHLNE73I5MVERRF3HCKCKQO6Z6J3E62T4A3NE54QYPDWBI7HNUAN4WPQ',
		name: null,
		blocks: 28,
		share: 0.00022069139461197723,
		est_reward: 289.85728963225563
	},
	{
		rank: 56,
		addr: '7VXBA2OI2QTKOQEZDSSP7YVF4ZMZDXEVN67RU6XR7ZYGS3ZXWWTX4IUZJY',
		name: null,
		blocks: 28,
		share: 0.00022069139461197723,
		est_reward: 289.85728963225563
	},
	{
		rank: 57,
		addr: 'IN66ENLHI6M7EYYVFOGYGAR3PF3GQ6F55E6JFL3EH43N4VFKQGAREAW7X4',
		name: null,
		blocks: 26,
		share: 0.0002049277235682646,
		est_reward: 269.15319751566597
	},
	{
		rank: 58,
		addr: '77I23A2TSBL3AHSXTMPYO5JP7LX677H6WDEXCFAKY52CJPLDL2LQ4KFR34',
		name: null,
		blocks: 26,
		share: 0.0002049277235682646,
		est_reward: 269.15319751566597
	},
	{
		rank: 59,
		addr: 'LVFRJU2ULHAPUPY2XVCINL4VONCWUS7GKODAIFM6HMQ6N7IL5QMTLL7DFI',
		name: null,
		blocks: 24,
		share: 0.00018916405252455192,
		est_reward: 248.44910539907625
	},
	{
		rank: 60,
		addr: 'BBAUW76RJAOLLXCQWNNEACC2RWLABW5AA5E66VIFLNLQPKDQCGPPBOUBZQ',
		name: null,
		blocks: 24,
		share: 0.00018916405252455192,
		est_reward: 248.44910539907625
	},
	{
		rank: 61,
		addr: 'Y7AR5SCVH3RINIDG3DEN7ATIKHI4QGWAWM4SMRKVK6NWHDUTBJ5CNANPN4',
		name: null,
		blocks: 20,
		share: 0.0001576367104371266,
		est_reward: 207.0409211658969
	},
	{
		rank: 62,
		addr: 'XNRRR67J7OWUKOELYDZJ7GALUC6MWIF6GLV3ADMMPFNOQZZXIYGDQZENTU',
		name: null,
		blocks: 20,
		share: 0.0001576367104371266,
		est_reward: 207.0409211658969
	},
	{
		rank: 63,
		addr: '55RFGM2M7KG65CO5FLJX6BGRPOINBS2KGTNNXXTPY7D6JACXUNRPET3DEI',
		name: null,
		blocks: 20,
		share: 0.0001576367104371266,
		est_reward: 207.0409211658969
	},
	{
		rank: 64,
		addr: 'G2OYAUKAEINBZ4YHUDYDDARZY3PXE7TBHN37ACIXHUPVIYWRHALO2I326E',
		name: null,
		blocks: 19,
		share: 0.00014975487491527027,
		est_reward: 196.68887510760203
	},
	{
		rank: 65,
		addr: 'FGHC3K7W3UE7TRIRZJHXZWU3CUCEGQF4CG5AP3RUV3KPQZQ7WZHPEM27W4',
		name: null,
		blocks: 17,
		share: 0.0001339912038715576,
		est_reward: 175.98478299101234
	},
	{
		rank: 66,
		addr: 'TG4XRUVGGQZOS6JYNRFN5EWBL2ZKWKZHIOIC2OKURX3FPFYKFCYJ7X44M4',
		name: null,
		blocks: 15,
		share: 0.00011822753282784495,
		est_reward: 155.28069087442267
	},
	{
		rank: 67,
		addr: 'WSEJSUK7SZE2C3OKAKFSYG7DDRHNSKKSGTFBOV4LB3VB6XZPFDRR23ESOE',
		name: null,
		blocks: 14,
		share: 0.00011034569730598861,
		est_reward: 144.92864481612781
	},
	{
		rank: 68,
		addr: 'NZWMLA5IJQF2AOTTJLIGHV7ITPIC7D5REELR3BCLTXIS4QVUW3S7XNCR4Q',
		name: null,
		blocks: 14,
		share: 0.00011034569730598861,
		est_reward: 144.92864481612781
	},
	{
		rank: 69,
		addr: 'JGHKUW2KZEXBQRYOA3O3ZSAOIBJ7DSCLJ2CBIH6IK4XKJAM5PDKP7XKPDI',
		name: null,
		blocks: 14,
		share: 0.00011034569730598861,
		est_reward: 144.92864481612781
	},
	{
		rank: 70,
		addr: 'CUN4MHOHLVE7LNPRXFZOOWPNEIZFUGAC7BT53G5XDJFLCZP4I3WTHZ75TY',
		name: null,
		blocks: 14,
		share: 0.00011034569730598861,
		est_reward: 144.92864481612781
	},
	{
		rank: 71,
		addr: '65Z4RSSNWO4N6BBF7FINJC2ZE6F7JBVCEFMKKMWZ3RZA7VTX4RXZWCLLVA',
		name: null,
		blocks: 14,
		share: 0.00011034569730598861,
		est_reward: 144.92864481612781
	},
	{
		rank: 72,
		addr: 'RWWPRMCREMUTSSQ35VTSMH5LNT737K3TM5ITTVQXDSFQH3A2MT3IOGAPBI',
		name: null,
		blocks: 11,
		share: 8.670019074041963e-5,
		est_reward: 113.87250664124329
	},
	{
		rank: 73,
		addr: 'GLATXZDISJC3I4THUEVP5ANTOG66IGPOIIGVTGZ6RGY4UMX4KMAKF4VKKM',
		name: null,
		blocks: 10,
		share: 7.88183552185633e-5,
		est_reward: 103.52046058294844
	},
	{
		rank: 74,
		addr: 'OPJ4Q6LQV4IW4YSGFQ44R35EMDNTV6YKWM3UNNJLRK6R76EE2Q2FI463NI',
		name: null,
		blocks: 9,
		share: 7.093651969670697e-5,
		est_reward: 93.1684145246536
	},
	{
		rank: 75,
		addr: 'I7QF6NYSQVKAHJ3GH46DZ7VDNBURLCPSPQSX4BOV6P5LUNDAZYEEVAZFYQ',
		name: null,
		blocks: 9,
		share: 7.093651969670697e-5,
		est_reward: 93.1684145246536
	},
	{
		rank: 76,
		addr: 'G5KN4QLHB4QYG5C2J72UOWYTWHWFGVLE5UJQJV3FX66EBZDUNEIBYJRQBU',
		name: null,
		blocks: 9,
		share: 7.093651969670697e-5,
		est_reward: 93.1684145246536
	},
	{
		rank: 77,
		addr: 'A3EFAQNNP5XMZDSDQ6AFUXQCCHLMLFN2YUIQYEDWO5W6MZY5CGLTGBGIXM',
		name: null,
		blocks: 9,
		share: 7.093651969670697e-5,
		est_reward: 93.1684145246536
	},
	{
		rank: 78,
		addr: 'QR6MTW2YUU643VS6NAINR7DMZR5MWAA5DSHVIL6YXLJHXZ3BPYYABFMDXU',
		name: null,
		blocks: 8,
		share: 6.305468417485064e-5,
		est_reward: 82.81636846635875
	},
	{
		rank: 79,
		addr: '7ACD53ZSMQ5ICUMXJI37PK2GCIJE2XZ3UPUZ4RPR2KO6JX6FAFQUDMCUUE',
		name: null,
		blocks: 8,
		share: 6.305468417485064e-5,
		est_reward: 82.81636846635875
	},
	{
		rank: 80,
		addr: '2EIA7JK5SFFTG57KFFNM3QXJMHIY45APSAABR7CBPZN7GRKM522SWGQ254',
		name: null,
		blocks: 8,
		share: 6.305468417485064e-5,
		est_reward: 82.81636846635875
	},
	{
		rank: 81,
		addr: 'WVR5E6DTYU2DLVGXQ6D4VCVGTDJQXIKKNQNABOOFM3QHAG3DX2W3PZOBEU',
		name: null,
		blocks: 7,
		share: 5.517284865299431e-5,
		est_reward: 72.46432240806391
	},
	{
		rank: 82,
		addr: 'YQ6SLTTI65XSTPSBOV6ZXTQSOXQK43EEYQ6P77526KRVI5BNFAPSCKNW3Y',
		name: null,
		blocks: 6,
		share: 4.729101313113798e-5,
		est_reward: 62.11227634976906
	},
	{
		rank: 83,
		addr: 'S25HHR4YAWDWGIJVKDO5YUSE22CU4LUI5XMFFDU3EYOJAH5SXXOXT2UU4E',
		name: null,
		blocks: 6,
		share: 4.729101313113798e-5,
		est_reward: 62.11227634976906
	},
	{
		rank: 84,
		addr: 'HI7H5FCKKRWO4VPAW22ZURRS5YJLYYHW4TO4WHVIAEU5DYGLPCVOFM4W3Q',
		name: null,
		blocks: 5,
		share: 3.940917760928165e-5,
		est_reward: 51.76023029147422
	},
	{
		rank: 85,
		addr: 'GFBCTV3SIUGF3RRIROT4QLO72L4XHQU2OG7UXERB2OFVCOHOT46A3BKHXU',
		name: null,
		blocks: 4,
		share: 3.152734208742532e-5,
		est_reward: 41.40818423317938
	},
	{
		rank: 86,
		addr: '4P5HSZMAKSFCXSLTDDD72GCNUUHS27HHGPW2H2SAHQ3PMA36KG35MKQD4Y',
		name: null,
		blocks: 4,
		share: 3.152734208742532e-5,
		est_reward: 41.40818423317938
	},
	{
		rank: 87,
		addr: 'RT72SYRHVZVBRGVVHJ5QJ2BLNH32BUFJEJ7HKHZAA7ULNK5G5GPEG7RSJM',
		name: null,
		blocks: 3,
		share: 2.364550656556899e-5,
		est_reward: 31.05613817488453
	},
	{
		rank: 88,
		addr: 'PGZBJPDOTMV4RUJIPSIILXTPLY37VV7WRCPCSKDMK2FYTE7ZB7YHZ6BNL4',
		name: null,
		blocks: 3,
		share: 2.364550656556899e-5,
		est_reward: 31.05613817488453
	},
	{
		rank: 89,
		addr: 'OYLD5M4HL6NF7XGDRYU55Y6VFSS5ENPUV72R3VOUXYJOUEISCX447TPCFE',
		name: null,
		blocks: 3,
		share: 2.364550656556899e-5,
		est_reward: 31.05613817488453
	},
	{
		rank: 90,
		addr: 'OTAH5ZGTKZJSJBNYX7PDX2BHNZYB3AD4H6KMSVIRVSJXO2YAXWD5RLHKPQ',
		name: null,
		blocks: 3,
		share: 2.364550656556899e-5,
		est_reward: 31.05613817488453
	},
	{
		rank: 91,
		addr: 'M65BASQTRWTWEUMNXQZIQZKW2TWNRNKV36GT7S5PEZ7QAVCYB22R7ALCZE',
		name: null,
		blocks: 3,
		share: 2.364550656556899e-5,
		est_reward: 31.05613817488453
	},
	{
		rank: 92,
		addr: 'WJXRS2ZN6LJE5ICSA4GZRQXLMBT4NUHJDOBZTQ6W62DSHPWEW2VFBCKDKE',
		name: null,
		blocks: 2,
		share: 1.576367104371266e-5,
		est_reward: 20.70409211658969
	},
	{
		rank: 93,
		addr: 'SW6IYGKD7Y4B3JXPL6W65AMNXEX7ST4DDRR5B2YIMRZN5H4TVG6D4GBZ6U',
		name: null,
		blocks: 2,
		share: 1.576367104371266e-5,
		est_reward: 20.70409211658969
	},
	{
		rank: 94,
		addr: '7QPPH2ZUTEOJOXKIDBFYYXFTJ7ZYWM2ITZONITADIKLWEWEHQHIWA6FAPI',
		name: null,
		blocks: 2,
		share: 1.576367104371266e-5,
		est_reward: 20.70409211658969
	},
	{
		rank: 95,
		addr: 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4',
		name: null,
		blocks: 1,
		share: 7.88183552185633e-6,
		est_reward: 10.352046058294844
	},
	{
		rank: 96,
		addr: 'MYH4KRMEQWHJ3I6RXPM3K4KXYUOUCUJDK7D6HUIY25DIU3BKGS3PGSW2GY',
		name: null,
		blocks: 1,
		share: 7.88183552185633e-6,
		est_reward: 10.352046058294844
	},
	{
		rank: 97,
		addr: 'CVVDSX3ZNMY437AD2KY5FB4Q3HQRKVOWAQ7WC53APHJIAU6DVMXJG7HZCI',
		name: null,
		blocks: 1,
		share: 7.88183552185633e-6,
		est_reward: 10.352046058294844
	}
];

// Online contracts first, then descending balance.
export const lockContracts = [
	{
		id: 36907,
		addr: 'BZSZGHMAFQLRWCOFQSMWQRAIFXGR6IKLTU7WNGOLEYRJTQWUEWERIKV5QY',
		balance: 21928131.84668,
		online: true,
		key_days: 304.3234435797665,
		key_expiry: '2027-08-25',
		blocks_now: 4096,
		next_vesting: 'November 27, 2029 at 07:53 PM UTC',
		next_amount: 1812916.49
	},
	{
		id: 36914,
		addr: 'IX3ZPAWOIDIGDFT3DSUDOC76ZPYWRX7DHQECWS2OJBV2WMSY3THB3ZCUQI',
		balance: 17406675.241512,
		online: true,
		key_days: 304.33002594033724,
		key_expiry: '2027-08-25',
		blocks_now: 3244,
		next_vesting: 'November 27, 2029 at 07:53 PM UTC',
		next_amount: 1439112.79
	},
	{
		id: 36922,
		addr: 'ODCM3IWPLXAKSWGLNWOXO7YK2ZXGKCKF7MY2DAEROSRB2YIF3AJU7SXDPE',
		balance: 16601775.881785,
		online: true,
		key_days: 304.3365110246433,
		key_expiry: '2027-08-25',
		blocks_now: 3048,
		next_vesting: 'November 27, 2029 at 07:53 PM UTC',
		next_amount: 1372715.44
	},
	{
		id: 284752,
		addr: '5KO3YI4NF3VLF5WVMI5HG5I4XY2SM7NPAA2NKTU4SQJFIPBPOIUX5ZE7MI',
		balance: 124416.1,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'November 27, 2029 at 07:53 PM UTC',
		next_amount: 10368.0
	},
	{
		id: 40441,
		addr: 'GEGPRM6KF4NZWVLRD7Y5EL4H3OZBDYOTOCRMNP2NDGI5YVCKGPKHEGWILI',
		balance: 120321.2602,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'November 27, 2026 at 11:53 PM UTC',
		next_amount: 10026.76
	},
	{
		id: 49845,
		addr: 'A2UD6WQI2C7PK7KL5OOXJ36M2JRILQS6NYICQ3WFUMXMJW5ZFZICJO75PM',
		balance: 102379.797239,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'November 27, 2029 at 07:53 PM UTC',
		next_amount: 8531.64
	},
	{
		id: 52003,
		addr: 'LOIW7NU2MAY5CZAVI3F2O6BOS5K5PRXXQT4BW2W4OIVUGEQUFGOL2FXA6U',
		balance: 64327.171773,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'November 27, 2026 at 11:53 PM UTC',
		next_amount: 5226.67
	},
	{
		id: 284668,
		addr: 'SW6UA4UZG6SOVZUYA2MCEW56SAVHHBOJC37DQNKYDJYLFWLPPA22YGE6MU',
		balance: 64168.046708,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'November 27, 2026 at 11:53 PM UTC',
		next_amount: 5226.67
	},
	{
		id: 39103,
		addr: 'S3DNLGQVRMSRJ57UUTL4LBIWQIBIYMYYIFCQQ3GPRUP6IAKMNFZK6PWATI',
		balance: 33645.209618,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 6602.07
	},
	{
		id: 429162,
		addr: 'EBUQSAU6GARQORVAODDZCG3I56GQICOHG6MEY5BJSTHJJ5S5GPZ562TYRM',
		balance: 21147.676627,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 1867.81
	},
	{
		id: 417216,
		addr: '45IO6L2NR6MBWSOC5G7OOGOPFSN7TGVZIABO6VSFOCFSGWNIB4PRGPE7SE',
		balance: 17569.883156,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 1549.12
	},
	{
		id: 41674,
		addr: 'SSQPW22N4SB5UXXWFWXOZVEGBWQDBTKK3UFXO5FMPPAKXDQQ6G3MHPT7VM',
		balance: 13400.884201,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 2591.24
	},
	{
		id: 450282,
		addr: 'M5A6JVYCVWAAWWTDQLICCQNUJNS26P2UQETLDVG6RUFM5SMX6HW3WV3O34',
		balance: 6828.233308,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 603.52
	},
	{
		id: 101152,
		addr: 'XQE5N3NOQ6QOWGXTPFJTOGYINZSFIXX3ASFGR4VYSVOL2I644IFW6BCA44',
		balance: 5613.4292,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 1101.58
	},
	{
		id: 400429,
		addr: 'VRTSZVOPD2RKZ4CTSCYANMGTOJCV222GZVQQJLN2ISCANAZ6G6BEC77WYE',
		balance: 1938.358841,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 166.67
	},
	{
		id: 406876,
		addr: 'GUMVOEJLC4VX2RJCKETFEQZGAKPK6METEJ3K7FHWJJJPCZWAB3GYGBD7VY',
		balance: 296.144045,
		online: false,
		key_days: null,
		key_expiry: null,
		blocks_now: 0,
		next_vesting: 'October 28, 2026 at 01:20 PM UTC',
		next_amount: 25.0
	}
];

export type Proposer = (typeof proposers)[number];
export type LockContract = (typeof lockContracts)[number];

export function epochRange(epoch: number): string {
	const start = new Date(Date.UTC(2026, 9, 21) + (epoch - 104) * 7 * 86_400_000);
	const end = new Date(start.getTime() + 6 * 86_400_000);
	const date = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	return `${date.format(start)} – ${date.format(end)}, ${end.getUTCFullYear()}`;
}

// C3: literal chart series from phase1/data/snapshot.json.
export const aprEpochs = [
	{
		epoch: 79,
		apr: 18.986746357235294,
		wallets: 231,
		stake: 657849184.1094338
	},
	{
		epoch: 80,
		apr: 17.452206748865574,
		wallets: 232,
		stake: 713655492.352541
	},
	{
		epoch: 81,
		apr: 17.3927054302752,
		wallets: 222,
		stake: 714059123.796906
	},
	{
		epoch: 82,
		apr: 17.67838873269282,
		wallets: 213,
		stake: 700520312.527013
	},
	{
		epoch: 83,
		apr: 17.184991288244596,
		wallets: 194,
		stake: 718581964.510347
	},
	{
		epoch: 84,
		apr: 17.413533370534793,
		wallets: 211,
		stake: 707132650.105108
	},
	{
		epoch: 85,
		apr: 17.630173482898556,
		wallets: 204,
		stake: 696455721.885573
	},
	{
		epoch: 86,
		apr: 21.21158518914595,
		wallets: 209,
		stake: 577217171.221373
	},
	{
		epoch: 87,
		apr: 17.49163159557074,
		wallets: 184,
		stake: 697981816.807275
	},
	{
		epoch: 88,
		apr: 17.60877819117091,
		wallets: 192,
		stake: 691365083.246044
	},
	{
		epoch: 89,
		apr: 17.43773121189828,
		wallets: 131,
		stake: 696159761.409609
	},
	{
		epoch: 90,
		apr: 17.303631528247337,
		wallets: 133,
		stake: 699558238.988119
	},
	{
		epoch: 91,
		apr: 17.18567025390595,
		wallets: 128,
		stake: 702355382.226459
	},
	{
		epoch: 92,
		apr: 17.21703122998493,
		wallets: 126,
		stake: 699080546.420693
	},
	{
		epoch: 93,
		apr: 20.701615103586832,
		wallets: 105,
		stake: 579753760.271609
	},
	{
		epoch: 94,
		apr: 16.6396590439747,
		wallets: 159,
		stake: 719226299.551706
	},
	{
		epoch: 95,
		apr: 16.558635146475716,
		wallets: 164,
		stake: 720688649.422891
	},
	{
		epoch: 96,
		apr: 16.44343772719136,
		wallets: 159,
		stake: 723671910.790429
	},
	{
		epoch: 97,
		apr: 16.393186622838464,
		wallets: 160,
		stake: 723824273.644818
	},
	{
		epoch: 98,
		apr: 16.531977746213922,
		wallets: 153,
		stake: 715704907.279452
	},
	{
		epoch: 99,
		apr: 16.463230575435215,
		wallets: 103,
		stake: 716648068.915727
	},
	{
		epoch: 100,
		apr: 16.331690276672656,
		wallets: 106,
		stake: 720363942.7821
	},
	{
		epoch: 101,
		apr: 16.502102222874655,
		wallets: 124,
		stake: 710895972.013705
	},
	{
		epoch: 102,
		apr: 16.348282177024025,
		wallets: 122,
		stake: 715542701.877283
	},
	{
		epoch: 103,
		apr: 16.04577141286866,
		wallets: 98,
		stake: 726957782.2008
	},
	{
		epoch: 104,
		apr: 16.037916132129265,
		wallets: 97,
		stake: 725243947.167079
	}
];
export const stakeDaily = [
	{
		date: '2026-09-25',
		stake: 719.0083020694237
	},
	{
		date: '2026-09-26',
		stake: 719.0086262994771
	},
	{
		date: '2026-09-27',
		stake: 719.0109033311762
	},
	{
		date: '2026-09-28',
		stake: 718.9896049667507
	},
	{
		date: '2026-09-29',
		stake: 720.2949429399066
	},
	{
		date: '2026-09-30',
		stake: 721.5920615805909
	},
	{
		date: '2026-10-01',
		stake: 724.1621380463771
	},
	{
		date: '2026-10-02',
		stake: 726.1679986282775
	},
	{
		date: '2026-10-03',
		stake: 714.2187140697871
	},
	{
		date: '2026-10-04',
		stake: 720.8811054960935
	},
	{
		date: '2026-10-05',
		stake: 725.9989813980764
	},
	{
		date: '2026-10-06',
		stake: 720.9566629907814
	},
	{
		date: '2026-10-07',
		stake: 662.4400272815897
	},
	{
		date: '2026-10-08',
		stake: 476.30328961076714
	},
	{
		date: '2026-10-09',
		stake: 476.6017002317607
	},
	{
		date: '2026-10-10',
		stake: 476.6003043295545
	},
	{
		date: '2026-10-11',
		stake: 476.6156071835337
	},
	{
		date: '2026-10-12',
		stake: 476.6118146319474
	},
	{
		date: '2026-10-13',
		stake: 662.7755840096571
	},
	{
		date: '2026-10-14',
		stake: 719.3860646379331
	},
	{
		date: '2026-10-15',
		stake: 732.7688393750886
	},
	{
		date: '2026-10-16',
		stake: 732.8499257783955
	},
	{
		date: '2026-10-17',
		stake: 727.1464950522425
	},
	{
		date: '2026-10-18',
		stake: 727.1892541899506
	},
	{
		date: '2026-10-19',
		stake: 727.3287044809229
	},
	{
		date: '2026-10-20',
		stake: 726.9833837229269
	},
	{
		date: '2026-10-21',
		stake: 728.1455903582929
	},
	{
		date: '2026-10-22',
		stake: 727.8277182823796
	},
	{
		date: '2026-10-23',
		stake: 727.3178328740808
	},
	{
		date: '2026-10-24',
		stake: 725.2332347849485
	},
	{
		date: '2026-10-25',
		stake: 725.243947167079
	}
];
export const blockHistory = [
	{
		epoch: 92,
		blocks: 18329,
		total: 217781,
		est: 194805.36987616,
		stake: 0,
		expected: 17425.63863085058
	},
	{
		epoch: 93,
		blocks: 21305,
		total: 218128,
		est: 225431.4899050099,
		stake: 0,
		expected: 21045.71941777305
	},
	{
		epoch: 94,
		blocks: 18226,
		total: 217675,
		est: 192703.4331089928,
		stake: 0,
		expected: 16929.297087132447
	},
	{
		epoch: 95,
		blocks: 17440,
		total: 218143,
		est: 183473.80791499154,
		stake: 0,
		expected: 16931.26987443313
	},
	{
		epoch: 96,
		blocks: 17518,
		total: 218544,
		est: 183432.64335785928,
		stake: 0,
		expected: 16892.467990416204
	},
	{
		epoch: 97,
		blocks: 17428,
		total: 218443,
		est: 182054.9960218455,
		stake: 0,
		expected: 16881.106973909737
	},
	{
		epoch: 98,
		blocks: 17355,
		total: 218268,
		est: 180921.43026004726,
		stake: 0,
		expected: 17058.93863170591
	},
	{
		epoch: 99,
		blocks: 17418,
		total: 218322,
		est: 181016.61406546296,
		stake: 0,
		expected: 17040.702678021713
	},
	{
		epoch: 100,
		blocks: 17343,
		total: 219543,
		est: 178724.70115193835,
		stake: 0,
		expected: 17047.612332662706
	},
	{
		epoch: 101,
		blocks: 17195,
		total: 219131,
		est: 177027.339468172,
		stake: 0,
		expected: 17242.240560279508
	},
	{
		epoch: 102,
		blocks: 24840,
		total: 215254,
		est: 259600.00650394417,
		stake: 0,
		expected: 16827.190325650772
	},
	{
		epoch: 103,
		blocks: 17306,
		total: 215613,
		est: 180047.95977979063,
		stake: 0,
		expected: 16590.584431730123
	}
];

// Synthetic low epoch: the snapshot has no epoch below 85% of expected.
export const illustrativeLowBlocks = blockHistory.map((row) =>
	row.epoch === 99 ? { ...row, blocks: 12000 } : { ...row }
);
export const searchWallets = [
	{ name: 'shelly.of.voi', address: 'G3MSA75OZEJTCCENOJDLDJK7UD7E2K5DNC7FVHCNOV7E3I4DTXTOWDUIFQ' },
	{ name: 'xarmian.voi', address: 'R7TBR3Y5QCM6Y2OPQP3BPNUQG7TLN75IOC2WTNRUKO4VPNSDQF52MZB4ZE' },
	{ name: 'corn.voi', address: 'FZPGANXMQIHVSWYN6ZXS63QO5A5X4LEYCB4O52IP37HR6LY5RJY6FRC3LA' },
	{ name: 'gov.voi', address: '2RMPWZ6VDF5FKNIWLQQRJFMIXRCOML5NWB2XBLIUOVPQCW56F7VTUQCMAU' }
];
// Illustrative archive dates, not a historical programme-end assertion.
export const archiveExample = {
	programme: 'Phase 2 testnet',
	endedOn: 'Nov 2025',
	frozenAt: 'Nov 30, 2025'
};
