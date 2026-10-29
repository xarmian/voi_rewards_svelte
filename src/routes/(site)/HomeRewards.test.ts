import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { render } from 'svelte/server';
import HomeRewards from './HomeRewards.svelte';
import NicknameDialog from './NicknameDialog.svelte';
import { favorites } from '../../stores/favorites';
import { nicknames } from '$lib/stores/nicknames';
import type { DashboardData } from '$lib/server/home';
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
// Epoch 104 proposer addresses and counts from phase1/data/snapshot.json.
const data = [
	{
		proposer: 'QKCTN6IX3TFNGN6LXSBNQQERXZUUXNDRTQWDTQBMHBZOTXLYJCEABU6ZX4',
		block_count: 44014
	},
	{
		proposer: 'ARAMIDFJYV2TOFB5MRNZJIXBSAVZCVAUDAPFGKR5PNX4MTILGAZABBTXQQ',
		block_count: 22127
	},
	{
		proposer: 'H4F46WCUMJBTVCW7P466RJJBTETOKOQR43YALSWXA5DUPEKWTFGABNBILA',
		block_count: 18877
	},
	{
		proposer: 'KEHBBPFOY4YA732JEWFJRDYRFN7UACAN2B5FUKSEFOUU3XPOOXJGMLMD5U',
		block_count: 4532
	},
	{
		proposer: 'BZSZGHMAFQLRWCOFQSMWQRAIFXGR6IKLTU7WNGOLEYRJTQWUEWERIKV5QY',
		block_count: 4096
	},
	{
		proposer: 'FZPGANXMQIHVSWYN6ZXS63QO5A5X4LEYCB4O52IP37HR6LY5RJY6FRC3LA',
		block_count: 3848
	},
	{
		proposer: 'R7TBR3Y5QCM6Y2OPQP3BPNUQG7TLN75IOC2WTNRUKO4VPNSDQF52MZB4ZE',
		block_count: 3268
	},
	{
		proposer: 'URTQDGMOXFRWV5T5DEU4TWMLCE7GFN7STKACMKN4K7C27PNJOG4KD2NTII',
		block_count: 3265
	},
	{
		proposer: 'IX3ZPAWOIDIGDFT3DSUDOC76ZPYWRX7DHQECWS2OJBV2WMSY3THB3ZCUQI',
		block_count: 3244
	},
	{
		proposer: 'ODCM3IWPLXAKSWGLNWOXO7YK2ZXGKCKF7MY2DAEROSRB2YIF3AJU7SXDPE',
		block_count: 3048
	},
	{
		proposer: 'W63BNB7XCRGZETCFMVVY36VHETRPFDDW7YNS7TZDBWLFZXYJBIBBEADFSI',
		block_count: 3001
	},
	{
		proposer: 'M6LSSFHG6BY7Z6CDVURRFHHKPMB7MHB7H7JILX2QW7UB2B6I76ORLPPNMQ',
		block_count: 2076
	},
	{
		proposer: 'A4KEV44PN6NX5R2FHQZTRCAZ6QCVARO3N7EK6STLV73FKH2AH2BGLAW25I',
		block_count: 1310
	},
	{
		proposer: '67VTGORLEYOBBW4YENVYURR7ILENL6OBT4ZE7GY4TI7AAG5JPVWBOQRNWY',
		block_count: 1152
	},
	{
		proposer: 'KSMGUNSX2IWGPZUHU5GPLLD7762T3KUKTPQZXCKNTVMSNZNKQ6RA37AYPI',
		block_count: 1151
	},
	{
		proposer: '2RMPWZ6VDF5FKNIWLQQRJFMIXRCOML5NWB2XBLIUOVPQCW56F7VTUQCMAU',
		block_count: 1014
	},
	{
		proposer: '2AWKWKA64Z5QCZFO35N45KTAKZ7HPPPI4FLAZUET5RA5TBK27YNO7WCSBU',
		block_count: 789
	},
	{
		proposer: 'BUD2763FMK6EYVKGHWWUN4QKHPSPCVFUEPPI4PQCPGYVPGQ6GNKBX6IXCQ',
		block_count: 581
	},
	{
		proposer: 'MUTS5EI5IYSNNM2QDLNPBJ2NNRSRRMUC4S6OTCXM3JZMHUAJOSJT6YUKRA',
		block_count: 549
	},
	{
		proposer: 'BGO4KGSBK6J33YX4HB245R4QGD73WUI7UMXMPPFFKDY5CXSXVW4ZUAYMEQ',
		block_count: 424
	},
	{
		proposer: 'OOOQETQ56ZLPXIHQT2EAGFSC6VRQN2QTJWUDCVAWHYA6GHDHAG5UMHYLQM',
		block_count: 356
	},
	{
		proposer: 'ALGONAUTSPIUHDCX3SLFXOFDUKOE4VY36XV4JX2JHQTWJNKVBKPEBQACRY',
		block_count: 264
	},
	{
		proposer: 'NOOBCIJETEMWKOKEHA6M25KJFHIZDHAKSLWHKQEL7BUJ573E6FY33JDU2A',
		block_count: 255
	},
	{
		proposer: '4WS6PXHM2CCS2Y3MWWIFI3XDE7IUTH47TXBEFCJAVLLMITG3OJOOCELWLE',
		block_count: 254
	},
	{
		proposer: 'RNKC72UKE535HMN2XIBDI2RURW6KRX3BG5CCXEKCABVQM5WFVTCQ5DZCIQ',
		block_count: 249
	},
	{
		proposer: '5L7J24SLGMYCOXGLE7WEHY76LRFKABOZNUSQDRXKJQYSYUO5KBIM3LCHX4',
		block_count: 249
	},
	{
		proposer: '3C7LRMA3U4TL6WBGSVEPBZ4TOA7M5NLAPE4BSYX3RBS3FVRGC73MYK3MPQ',
		block_count: 211
	},
	{
		proposer: 'RETURN4OG4JOC6GI5DRMKQ45HVNZHAFF4H7525UFGDFC33M2S7FDJMQJKU',
		block_count: 198
	},
	{
		proposer: 'NYDIDNITM72GYZUQAWWUFY3XISJWV6V7SXKFEHS56VC7I7E5RBOZI7C6JU',
		block_count: 198
	},
	{
		proposer: 'QRK6CD6M7LR7WPLXFNJGICNYOWICHOFW3HH3A5WCJSYEOSFLDLS2FGZ35A',
		block_count: 165
	},
	{
		proposer: 'GC7CLH2I6WR3BLDQHRQ2YFGOIDEICFFH7RLFD2TIBZFYCWRECNHJTWWTMM',
		block_count: 130
	},
	{
		proposer: 'PQGSWSSGQMK3HGT4OQFVL6G37JLSHR2GY7BY5U75BR3GEU7Z5YQWZU2AUA',
		block_count: 119
	},
	{
		proposer: 'EUSKXVC6SAZ5226QJCJDNYYCUJY4NCU2FM4MXEORTZCDIWNXKEYZ3LHXFA',
		block_count: 112
	},
	{
		proposer: '3YETMQMS2OISZFP7ZHL6QRFCXCOAJNQPHDUXII4FGEQKAGQIN2A2JBZTAA',
		block_count: 108
	},
	{
		proposer: 'ZWES7RROIBRLGZGAFXPUA2RJ2RKN2ZPJIIU25FOPEQBDJYNCADBGA7W6OQ',
		block_count: 104
	},
	{
		proposer: 'XKTKTIKSPKYPNEVFJ6UCPDK23NHGOU5VGQPKNYWT5QDKHI74VBDZE6LTDQ',
		block_count: 104
	},
	{
		proposer: 'EPAQ5RMLYIPJOEAALOIIOT2AVOWBFATDI2RYVTCQD6PZ2SRFG5VAKBUSK4',
		block_count: 103
	},
	{
		proposer: 'LXWHVDE52P4Q7KERP2MASLXVPDPCUADL6JI76HDKDSKRLBHD7JOKAPIABM',
		block_count: 92
	},
	{
		proposer: 'LRSUSI3IRQKI6QJTYBJWU6HHVUMEKPR653UNGHIAK4Q765NMBLAJOFSWCI',
		block_count: 83
	},
	{
		proposer: 'C46D7INVWU4U2CPOE5NVZT6ZB5NWOLU57U6BDTRFGEDWRKHTT7SPG3JTCA',
		block_count: 74
	},
	{
		proposer: 'MJ7UXEELSYC3LP6BZINUTHAX3LP33FFU7GT33GSI6M2OPO33OZSRAPKZIY',
		block_count: 65
	},
	{
		proposer: 'KEWXZZ5NTVGRNG4Z3E4XL7QXKTP656QZIYYIAO3YGSGBKHPDE2KFE4XDVQ',
		block_count: 60
	},
	{
		proposer: 'BQ6FDNZ7OB5OZTYVH7UJWYD5UZRKT6SCZ5XKJ4R56Z22SCCF3OW3Z3VG5Q',
		block_count: 60
	},
	{
		proposer: 'SGY55W3DA7ZEBJOOQFB4ARLGFBMHP5ZCV3TLAY4PYVA6NOE2BDN57WCRSU',
		block_count: 58
	},
	{
		proposer: 'N6MOAOGIWIGB2UJHPLVF3BMBYVYBSCQ6F7MQ6U4CCWBSJM4TCTLZB2QR4Y',
		block_count: 48
	},
	{
		proposer: 'CW44JRNRMO4K26JIKROZQZXQ626I46JO7IKFZ2YMOT6M3PZTIJZCUADZ5Q',
		block_count: 42
	},
	{
		proposer: 'HLTLJ5W47GLNOG5EEXPYZCVSK5MUHFUKBHA2L2PZZGZIT33GNTREZ2AUXY',
		block_count: 40
	},
	{
		proposer: 'GNEHXZDDDKFEVUSGC5PPNWHWQT4YSZO6KLDI4SR5BYXH5J2DBVQIJ65YUI',
		block_count: 38
	},
	{
		proposer: 'C4SIBJGPHLXNRCNJFXLJ3NUPPOJ66U5O3CTCFMUGMMTKKCNOEQPHNWT6QY',
		block_count: 37
	},
	{
		proposer: 'CREPE2LPXG7ATFOBJC4RADFEDOQI4N6BWA5YPFE5JKWMHG7PVYNEQETHGU',
		block_count: 36
	},
	{
		proposer: 'PNVSXTXFB4P5IXIOTMMEKP46HA5FPIGABHEY52APLNZO6E35ZQFOGRVWMQ',
		block_count: 35
	},
	{
		proposer: 'SGLHEZJULD3QM7GUNXR43PW2ZXEEL4S4XDBC474YZPKTRVYDA4TVGZCITM',
		block_count: 30
	},
	{
		proposer: 'MJR7GQHH6C7IE6TFP3CXVPVFUK45YMY7HYHPIMAXEZ424U2UR3MP53ML5A',
		block_count: 29
	},
	{
		proposer: 'TNBABD63I7N4RJ5DYEY7XPWDOO3FERJZUVGE3VKB2PADKOHDKPJVXSJWPM',
		block_count: 28
	},
	{
		proposer: 'ALPHLNE73I5MVERRF3HCKCKQO6Z6J3E62T4A3NE54QYPDWBI7HNUAN4WPQ',
		block_count: 28
	},
	{
		proposer: '7VXBA2OI2QTKOQEZDSSP7YVF4ZMZDXEVN67RU6XR7ZYGS3ZXWWTX4IUZJY',
		block_count: 28
	},
	{
		proposer: 'IN66ENLHI6M7EYYVFOGYGAR3PF3GQ6F55E6JFL3EH43N4VFKQGAREAW7X4',
		block_count: 26
	},
	{
		proposer: '77I23A2TSBL3AHSXTMPYO5JP7LX677H6WDEXCFAKY52CJPLDL2LQ4KFR34',
		block_count: 26
	},
	{
		proposer: 'LVFRJU2ULHAPUPY2XVCINL4VONCWUS7GKODAIFM6HMQ6N7IL5QMTLL7DFI',
		block_count: 24
	},
	{
		proposer: 'BBAUW76RJAOLLXCQWNNEACC2RWLABW5AA5E66VIFLNLQPKDQCGPPBOUBZQ',
		block_count: 24
	},
	{
		proposer: 'Y7AR5SCVH3RINIDG3DEN7ATIKHI4QGWAWM4SMRKVK6NWHDUTBJ5CNANPN4',
		block_count: 20
	},
	{
		proposer: 'XNRRR67J7OWUKOELYDZJ7GALUC6MWIF6GLV3ADMMPFNOQZZXIYGDQZENTU',
		block_count: 20
	},
	{
		proposer: '55RFGM2M7KG65CO5FLJX6BGRPOINBS2KGTNNXXTPY7D6JACXUNRPET3DEI',
		block_count: 20
	},
	{
		proposer: 'G2OYAUKAEINBZ4YHUDYDDARZY3PXE7TBHN37ACIXHUPVIYWRHALO2I326E',
		block_count: 19
	},
	{
		proposer: 'FGHC3K7W3UE7TRIRZJHXZWU3CUCEGQF4CG5AP3RUV3KPQZQ7WZHPEM27W4',
		block_count: 17
	},
	{
		proposer: 'TG4XRUVGGQZOS6JYNRFN5EWBL2ZKWKZHIOIC2OKURX3FPFYKFCYJ7X44M4',
		block_count: 15
	},
	{
		proposer: 'WSEJSUK7SZE2C3OKAKFSYG7DDRHNSKKSGTFBOV4LB3VB6XZPFDRR23ESOE',
		block_count: 14
	},
	{
		proposer: 'NZWMLA5IJQF2AOTTJLIGHV7ITPIC7D5REELR3BCLTXIS4QVUW3S7XNCR4Q',
		block_count: 14
	},
	{
		proposer: 'JGHKUW2KZEXBQRYOA3O3ZSAOIBJ7DSCLJ2CBIH6IK4XKJAM5PDKP7XKPDI',
		block_count: 14
	},
	{
		proposer: 'CUN4MHOHLVE7LNPRXFZOOWPNEIZFUGAC7BT53G5XDJFLCZP4I3WTHZ75TY',
		block_count: 14
	},
	{
		proposer: '65Z4RSSNWO4N6BBF7FINJC2ZE6F7JBVCEFMKKMWZ3RZA7VTX4RXZWCLLVA',
		block_count: 14
	},
	{
		proposer: 'RWWPRMCREMUTSSQ35VTSMH5LNT737K3TM5ITTVQXDSFQH3A2MT3IOGAPBI',
		block_count: 11
	},
	{
		proposer: 'GLATXZDISJC3I4THUEVP5ANTOG66IGPOIIGVTGZ6RGY4UMX4KMAKF4VKKM',
		block_count: 10
	},
	{
		proposer: 'OPJ4Q6LQV4IW4YSGFQ44R35EMDNTV6YKWM3UNNJLRK6R76EE2Q2FI463NI',
		block_count: 9
	},
	{
		proposer: 'I7QF6NYSQVKAHJ3GH46DZ7VDNBURLCPSPQSX4BOV6P5LUNDAZYEEVAZFYQ',
		block_count: 9
	},
	{
		proposer: 'G5KN4QLHB4QYG5C2J72UOWYTWHWFGVLE5UJQJV3FX66EBZDUNEIBYJRQBU',
		block_count: 9
	},
	{
		proposer: 'A3EFAQNNP5XMZDSDQ6AFUXQCCHLMLFN2YUIQYEDWO5W6MZY5CGLTGBGIXM',
		block_count: 9
	},
	{
		proposer: 'QR6MTW2YUU643VS6NAINR7DMZR5MWAA5DSHVIL6YXLJHXZ3BPYYABFMDXU',
		block_count: 8
	},
	{
		proposer: '7ACD53ZSMQ5ICUMXJI37PK2GCIJE2XZ3UPUZ4RPR2KO6JX6FAFQUDMCUUE',
		block_count: 8
	},
	{
		proposer: '2EIA7JK5SFFTG57KFFNM3QXJMHIY45APSAABR7CBPZN7GRKM522SWGQ254',
		block_count: 8
	},
	{
		proposer: 'WVR5E6DTYU2DLVGXQ6D4VCVGTDJQXIKKNQNABOOFM3QHAG3DX2W3PZOBEU',
		block_count: 7
	},
	{
		proposer: 'YQ6SLTTI65XSTPSBOV6ZXTQSOXQK43EEYQ6P77526KRVI5BNFAPSCKNW3Y',
		block_count: 6
	},
	{
		proposer: 'S25HHR4YAWDWGIJVKDO5YUSE22CU4LUI5XMFFDU3EYOJAH5SXXOXT2UU4E',
		block_count: 6
	},
	{
		proposer: 'HI7H5FCKKRWO4VPAW22ZURRS5YJLYYHW4TO4WHVIAEU5DYGLPCVOFM4W3Q',
		block_count: 5
	},
	{
		proposer: 'GFBCTV3SIUGF3RRIROT4QLO72L4XHQU2OG7UXERB2OFVCOHOT46A3BKHXU',
		block_count: 4
	},
	{
		proposer: '4P5HSZMAKSFCXSLTDDD72GCNUUHS27HHGPW2H2SAHQ3PMA36KG35MKQD4Y',
		block_count: 4
	},
	{
		proposer: 'RT72SYRHVZVBRGVVHJ5QJ2BLNH32BUFJEJ7HKHZAA7ULNK5G5GPEG7RSJM',
		block_count: 3
	},
	{
		proposer: 'PGZBJPDOTMV4RUJIPSIILXTPLY37VV7WRCPCSKDMK2FYTE7ZB7YHZ6BNL4',
		block_count: 3
	},
	{
		proposer: 'OYLD5M4HL6NF7XGDRYU55Y6VFSS5ENPUV72R3VOUXYJOUEISCX447TPCFE',
		block_count: 3
	},
	{
		proposer: 'OTAH5ZGTKZJSJBNYX7PDX2BHNZYB3AD4H6KMSVIRVSJXO2YAXWD5RLHKPQ',
		block_count: 3
	},
	{
		proposer: 'M65BASQTRWTWEUMNXQZIQZKW2TWNRNKV36GT7S5PEZ7QAVCYB22R7ALCZE',
		block_count: 3
	},
	{
		proposer: 'WJXRS2ZN6LJE5ICSA4GZRQXLMBT4NUHJDOBZTQ6W62DSHPWEW2VFBCKDKE',
		block_count: 2
	},
	{
		proposer: 'SW6IYGKD7Y4B3JXPL6W65AMNXEX7ST4DDRR5B2YIMRZN5H4TVG6D4GBZ6U',
		block_count: 2
	},
	{
		proposer: '7QPPH2ZUTEOJOXKIDBFYYXFTJ7ZYWM2ITZONITADIKLWEWEHQHIWA6FAPI',
		block_count: 2
	},
	{
		proposer: 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4',
		block_count: 1
	},
	{
		proposer: 'MYH4KRMEQWHJ3I6RXPM3K4KXYUOUCUJDK7D6HUIY25DIU3BKGS3PGSW2GY',
		block_count: 1
	},
	{
		proposer: 'CVVDSX3ZNMY437AD2KY5FB4Q3HQRKVOWAQ7WC53APHJIAU6DVMXJG7HZCI',
		block_count: 1
	}
];
const initial: DashboardData['rewards'] = {
	state: 'ready',
	value: {
		rangeId: '20261021-20261027',
		data: {
			data,
			num_blocks: 126874,
			num_blocks_ballast: 0,
			blacklist: [],
			max_timestamp: '2026-10-25T02:38:45Z'
		},
		params: {
			block_reward_pool: 2236808,
			total_blocks: 126874,
			reward_per_block: 10.352046058294844,
			total_blocks_projected: 216074
		}
	}
};
const html = (pending = false, value: DashboardData['rewards'] = initial) =>
	render(HomeRewards, {
		props: {
			initial: value,
			currentEpoch: 104,
			initialEpoch: 104,
			price: pending
				? new Promise<never>(() => {})
				: Promise.resolve({
						state: 'ready' as const,
						value: { price: 0.000127, change24h: null, mcap: null }
					})
		}
	}).body.replace(/<!--[\s\S]*?-->/g, '');
// Same tag-stack check as C2 DataTable tests.
function noNestedControls(markup: string) {
	const stack: string[] = [];
	for (const match of markup.matchAll(/<(\/?)(button|a)\b[^>]*>/g)) {
		if (match[1]) assert.equal(stack.pop(), match[2]);
		else {
			assert.equal(stack.length, 0, 'interactive controls must not nest');
			stack.push(match[2]);
		}
	}
	assert.equal(stack.length, 0);
}
afterEach(() => {
	favorites.reset();
	nicknames.reset();
});
test.each([false, true])(
	'SSR shows 15 linked proposers, row controls, and pending USD (pending=%s)',
	(pending) => {
		const body = html(pending);
		assert.equal((body.match(/<table\b/g) ?? []).length, 1);
		assert.match(body, /<caption[^>]*>Who's earning this epoch<\/caption>/);
		assert.equal((body.match(/<a[^>]*href="\/wallet\//g) ?? []).length, 15);
		assert.match(body, /<button[^>]*aria-expanded="false"[^>]*>See all 97 proposers<\/button>/);
		assert.equal((body.match(/aria-sort=/g) ?? []).length, 1);
		assert.match(body, /<th[^>]*aria-sort="descending"[^>]*>\s*<button[^>]*>Blocks/);
		assert.equal((body.match(/aria-pressed="false"/g) ?? []).length, 15);
		assert.equal((body.match(/Favourite [^<]+/g) ?? []).length, 15);
		assert.equal((body.match(/aria-haspopup="menu"/g) ?? []).length, 15);
		assert.match(body, /role="group" aria-label="Epoch"/);
		assert.match(body, /<button[^>]*aria-label="Next epoch"[^>]*disabled/);
		assert.doesNotMatch(body, /\$0|<dialog[^>]*\bopen\b/);
		const usdCells =
			body.match(/<td[^>]*class="[^"]*hidden lg:table-cell[^>]*>[\s\S]*?<\/td>/g) ?? [];
		assert.equal(usdCells.length, 15);
		for (const cell of usdCells) assert.match(cell, />\s*—\s*<\/td>/);
		noNestedControls(body);
	}
);
test('toolbar keeps labelled search, CSV, Refresh, and conditional favourites', () => {
	favorites.toggle(data[0].proposer);
	const body = html();
	assert.match(body, /<input[^>]*type="search"[^>]*aria-label="Filter proposers"/);
	assert.match(body, /placeholder="Filter by address, enVoi name, nickname or node"/);
	assert.match(body, /<button[^>]*aria-pressed="true"[^>]*>Show enVoi names<\/button>/);
	for (const label of ['Download CSV', 'Refresh'])
		assert.match(body, new RegExp(`<button[^>]*type="button"[^>]*>${label}</button>`));
	assert.match(body, /role="group" aria-label="Show"/);
	assert.match(body, />All<\/button>/);
	assert.match(body, />Favourites<\/button>/);
});
test('failed initial data has a retry alert without row data', () => {
	const body = html(true, { state: 'error', message: 'Failed' });
	assert.match(body, /role="alert"/);
	assert.match(body, />Retry<\/button>/);
	assert.doesNotMatch(body, /href="\/wallet\//);
});
test('nickname forms are keyed by address, with their own initial value', () => {
	nicknames.setNickname('A', 'alpha');
	nicknames.setNickname('B', 'beta');
	for (const [address, value] of [
		['A', 'alpha'],
		['B', 'beta']
	]) {
		const body = render(NicknameDialog, { props: { address, onclose: () => {} } }).body;
		assert.match(body, new RegExp(`<input[^>]*value="${value}"`));
		assert.match(body, new RegExp(`Nickname for ${address}`));
		assert.doesNotMatch(body, /<dialog[^>]*\bopen\b/);
	}
});
