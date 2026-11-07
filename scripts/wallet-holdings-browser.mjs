// Real Chromium fixture, using the installed browser and CDP; no test dependency or public route.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const profile = await mkdtemp('/tmp/holdings-chromium-');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, ws, server;
const errors = [];
let nftReads = 0;
let pendingNft;
try {
	server = await createServer({
		configFile: false,
		plugins: [
			{
				name: 'holdings-fixture',
				enforce: 'pre',
				resolveId(id) {
					if (id === '$env/static/public') return '\0fixture:env';
					if (id.endsWith('/services/accounts') || id.endsWith('/services/accounts.ts'))
						return '\0fixture:tokens';
					if (id.endsWith('/portfolio/accountDetails')) return '\0fixture:account';
					if (id.endsWith('/stores/price')) return '\0fixture:price';
					if (id.endsWith('/stores/dataTable') || id.endsWith('/stores/dataTable.ts'))
						return '\0fixture:epochs';
					if (id.endsWith('/utils/envoi')) return '\0fixture:envoi';

					if (id.endsWith('/chain/wallet.svelte')) return '\0fixture:$lib/chain/wallet.svelte';
					if (id.endsWith('/utils/arc200') || id.endsWith('/utils/arc200.ts'))
						return '\0fixture:arc200';
					if (
						id === '$app/environment' ||
						id === '$app/navigation' ||
						id === '$app/stores' ||
						id === '$lib/chain/wallet.svelte'
					)
						return '\0fixture:' + id;
				},
				load(id) {
					if (id === '\0fixture:env')
						return `export const PUBLIC_SUPABASE_URL='https://supabase.example'; export const PUBLIC_SUPABASE_ANON_KEY='fixture'; export const PUBLIC_MIMIR_URL='https://mimir.example'; export const PUBLIC_MIMIR_ANON_KEY='fixture'; export const PUBLIC_WALLETCONNECT_PROJECT_ID='fixture';`;
					if (id === '\0fixture:tokens')
						return `import {tokens} from '/src/lib/ds/WalletHoldings/fixtures.ts';
							const scenario = new URL(location.href).searchParams.get('case');
							const asset = (id, value, balance=1000000) => ({...tokens[0],id,name:'Asset '+id,value,balance,approvals:[]});
							globalThis.__tokenPopulation = scenario==='dust'
								? [...Array.from({length:5},(_,i)=>asset('priced'+i,10-i)), ...Array.from({length:3},(_,i)=>asset('unknown'+i,0)), ...Array.from({length:5},(_,i)=>asset('zero'+i,0,0))]
								: scenario==='duplicates' ? [tokens[0], {...tokens[0]}] : scenario==='membership-dust' ? [asset('unpriced',0),...tokens.slice(0,3)] : scenario==='keys' ? tokens.slice(0,3) : scenario==='amount' ? tokens.slice(0,9).map(t=>({...t,approvals:t.approvals.map(a=>({...a,amount:'4000'}))})) : tokens;
							export const fetchFungibleTokens = async address => {
								globalThis.__tokenReads=(globalThis.__tokenReads||0)+1;
								if(address==='B' && scenario!=='membership-address') { if(scenario==='address-failure') throw new Error('Token read refused'); return {tokens:[],partial:false}; }
								if(globalThis.__holdTokens) await new Promise((resolve,reject)=>{globalThis.__releaseTokens=resolve;globalThis.__rejectTokens=reject;});
								return {tokens:globalThis.__tokenPopulation,partial:false};
							};`;
					if (id === '\0fixture:account')
						return `export * from '/src/lib/portfolio/accountDetails.ts?fixture-real'; export const loadAccountDetails = async (address,deps,{onPart}) => {onPart('account',{status:'loaded',value:{balance:4000000,minBalance:100000,status:'Offline',pendingRewards:0,round:1}});onPart('createdAt',{status:'loaded',value:1});onPart('rewards',{status:'loaded',value:[]});}; export const totalRewardsMicroVoi = () => 0;`;
					if (id === '\0fixture:price')
						return `import {writable} from 'svelte/store'; export const voiPrice=writable({price:1,error:null,lastUpdated:new Date()}); export const fetchVoiPrice=async()=>{};`;
					if (id === '\0fixture:epochs')
						return `export const dataTable={fetchDateRanges:async()=>[]};`;
					if (id === '\0fixture:envoi')
						return `export const getEnvoiNames=async()=>[]; export const getEnvoiAddresses=async()=>[]; export const searchEnvoi=async()=>[]; export const resolveEnvoiToken=async()=>{throw new Error('Fixture NFT names unavailable')};`;

					if (id === '\0fixture:arc200')
						return `export const arc200TransferFrom = async (...args) => globalThis.__holdClaim ? new Promise(()=>{}) : args[5]([]); export const arc200Approve = async () => {throw new Error('Fixture approval refused')}; export const arc200RevokeApproval = arc200Approve; export const fetchOutgoingApprovals = async () => [];`;
					if (id === '\0fixture:$app/environment')
						return 'export const browser = true; export const dev = true;';
					if (id === '\0fixture:$app/navigation') return 'export const goto = () => {};';
					if (id === '\0fixture:$app/stores')
						return `import {writable} from 'svelte/store'; export const page = writable({url:new URL('http://localhost/wallet/Y')});`;
					if (id === '\0fixture:$lib/chain/wallet.svelte')
						return `import {writable} from 'svelte/store'; export const selectedWallet = writable({address:'Y',app:'fixture'}); export const connectedWallets = writable([]); export const wallets = writable([]); export const captureSigner = () => ({address:'Y'}); export const signTransactions = async () => {throw new Error('Fixture signing refused')}; export const signAndSendTransactions = signTransactions;`;
				},
				configureServer(vite) {
					vite.middlewares.use('/__holdings', async (_req, res) => {
						res.setHeader('Content-Type', 'text/html');
						res.end(
							await vite.transformIndexHtml(
								'/__holdings',
								`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="fixture"></div><script type="module">import {mount} from 'svelte'; import Fixture from '/src/lib/ds/WalletHoldings/HoldingsFixture.svelte'; import '/src/app.css'; mount(Fixture,{target:document.getElementById('fixture')});</script></body></html>`
							)
						);
					});
				}
			},
			svelte({ preprocess: vitePreprocess() })
		],
		resolve: {
			alias: [
				{ find: '$lib', replacement: resolve('src/lib') },
				{ find: /^bignumber\.js$/, replacement: 'bignumber.js/bignumber.js' }
			]
		},
		define: { global: 'globalThis' },
		server: { host: '127.0.0.1', port: 4182, strictPort: true },
		optimizeDeps: {
			include: [
				'svelte',
				'svelte/store',
				'flowbite-svelte',
				'flowbite-svelte-icons',
				'lodash-es',
				'd3-scale',
				'd3-shape',
				'@supabase/supabase-js',
				'algosdk',
				'ulujs'
			]
		}
	});
	await server.listen();
	if (!process.env.HOLDINGS_CHROMIUM) {
		throw new Error('Set HOLDINGS_CHROMIUM to the path of a Chromium or headless-shell binary');
	}
	browser = spawn(
		process.env.HOLDINGS_CHROMIUM,
		[
			'--no-sandbox',
			'--disable-dev-shm-usage',
			'--disable-background-networking',
			'--remote-debugging-port=0',
			`--user-data-dir=${profile}`,
			'about:blank'
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);
	let stderr = '';
	browser.stderr.on('data', (s) => (stderr += s));
	for (let n = 0; n < 100 && !stderr.includes('DevTools listening on'); n++) await pause(50);
	const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
	assert.ok(endpoint, stderr);
	const target = await (
		await fetch(`http://${new URL(endpoint).host}/json/new?about:blank`, { method: 'PUT' })
	).json();
	ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((yes, no) => {
		ws.onopen = yes;
		ws.onerror = no;
	});
	let id = 0;
	const pending = new Map();
	const send = (method, params = {}) =>
		new Promise((yes, no) => {
			const key = ++id;
			pending.set(key, { yes, no });
			ws.send(JSON.stringify({ id: key, method, params }));
		});
	ws.onmessage = ({ data }) => {
		const msg = JSON.parse(data);
		if (msg.id) {
			const task = pending.get(msg.id);
			pending.delete(msg.id);
			if (msg.error) task.no(msg.error);
			else task.yes(msg.result);
		}
		if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
		if (msg.method === 'Fetch.requestPaused') {
			const { requestId, request } = msg.params;
			if (request.url.includes('/nft-indexer/v1/tokens?owner=')) {
				nftReads++;
				pendingNft = requestId;
			} else if (new URL(request.url).hostname === '127.0.0.1')
				void send('Fetch.continueRequest', { requestId });
			else void send('Fetch.fulfillRequest', { requestId, responseCode: 503, body: '' });
		}
	};
	const evaluate = async (expression) => {
		const result = await send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true
		});
		if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
		return result.result.value;
	};
	const wait = async (expression) => {
		for (let n = 0; n < 300; n++) {
			if (await evaluate(expression)) return;
			await pause(100);
		}
		throw new Error(
			'Timed out: ' +
				expression +
				' ' +
				JSON.stringify(errors) +
				' DOM: ' +
				(await evaluate('document.body.innerText.slice(-2500)'))
		);
	};
	await send('Runtime.enable');
	await send('Page.enable');
	await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
	await send('Emulation.setDeviceMetricsOverride', {
		width: 320,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false
	});
	const open = async (scenario) => {
		await send('Page.navigate', { url: 'http://127.0.0.1:4182/__holdings?case=' + scenario });
		await wait(`document.querySelector('#ds-holdings-tokens [data-token-id]')`);
		await evaluate(
			`window.visible = el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; window.buttons = (root=document) => [...root.querySelectorAll('button')].filter(visible); window.clickText = text => { const b=buttons().find(b=>b.textContent.trim()===text); if(!b)throw new Error('Missing button '+text); b.click(); };`
		);
	};
	const cases = process.env.HOLDINGS_CASE
		? process.env.HOLDINGS_CASE.split(',')
		: [
				'membership-rank',
				'membership-dust',
				'membership-removal',
				'membership-address',
				'duplicates',
				'refresh',
				'sort',
				'dust',
				'address-empty',
				'address-failure',
				'address-identity',
				'keys',
				'amount',
				'claim-hide',
				'claim-less',
				'controls'
			];
	for (const scenario of cases.filter((name) => name !== 'controls')) {
		await open(scenario);
		if (scenario.startsWith('membership-')) {
			const id = scenario === 'membership-dust' ? 'unpriced' : '10';
			await evaluate(
				`window.keptNode=document.querySelector('[data-token-id="${id}"]'); window.keptController=keptNode.querySelector('.wallet-token-legacy');document.querySelector('button[aria-controls="'+keptNode.closest('tr').id+'"]').click();`
			);
			if (scenario === 'membership-rank') {
				await evaluate(`buttons(keptController).find(b=>b.textContent.trim()==='Send').click();`);
				await wait(`!!document.querySelector('[role="dialog"]')`);
				await evaluate(`window.keptDialog=document.querySelector('[role="dialog"]');`);
			}
			await evaluate(
				`__tokenPopulation=__tokenPopulation.map(t=>({...t, value:${scenario === 'membership-rank' ? "t.id==='11'?11.5:t.value" : "t.id==='" + id + "'?0.05:t.value"},approvals:t.id==='${id}'?[]:t.approvals}));clickText('Refresh tokens');`
			);
			await wait(`!buttons().find(b=>b.textContent.trim()==='Refresh tokens')?.disabled`);
			assert.equal(
				await evaluate(
					`keptNode.isConnected && keptNode===document.querySelector('[data-token-id="${id}"]') && keptController.isConnected`
				),
				true,
				'A rendered row keeps the same mounted node after its value changes'
			);
			if (scenario === 'membership-rank') {
				assert.equal(
					await evaluate(`keptDialog.isConnected && visible(keptDialog)`),
					true,
					'The token Send dialog stays open after the rank changes'
				);
			} else if (scenario === 'membership-removal') {
				await evaluate(
					`__tokenPopulation=__tokenPopulation.filter(t=>t.id!=='${id}');clickText('Refresh tokens');`
				);
				await wait(`!keptNode.isConnected`);
				assert.equal(
					await evaluate(`document.querySelector('[data-token-id="${id}"]')===null`),
					true,
					'A token removed from the source leaves the table'
				);
			} else if (scenario === 'membership-address') {
				await evaluate(`clickText('Switch page');`);
				await wait(`document.querySelector('[data-token-id="1"]') && !keptNode.isConnected`);
				assert.equal(
					await evaluate(
						`document.querySelectorAll('#ds-holdings-tokens div[data-token-id]').length`
					),
					10,
					'The new address starts with its own top ten'
				);
				assert.equal(
					await evaluate(`document.querySelector('[data-token-id="10"]')===null`),
					true,
					'The previous address has no remembered membership'
				);
				await evaluate(
					`window.otherAddressNode=document.querySelector('div[data-token-id="1"]');clickText('Switch page');`
				);
				await wait(
					`!otherAddressNode.isConnected && document.querySelector('div[data-token-id="1"]') && !buttons().find(b=>b.textContent.trim()==='Refresh tokens')?.disabled`
				);
				assert.equal(
					await evaluate(`document.querySelector('[data-token-id="10"]')===null`),
					true,
					'Returning to an address also starts with a fresh membership'
				);
			}
		} else if (scenario === 'duplicates') {
			await pause(100);
			assert.equal(errors.length, 0, JSON.stringify(errors));
			await evaluate(`clickText('Show claimable tokens');`);
			await wait(`document.querySelectorAll('.wallet-claim-legacy').length===2`);
			assert.equal(errors.length, 0, JSON.stringify(errors));
		} else if (scenario === 'refresh' || scenario === 'sort') {
			await evaluate(
				`window.initialRows=[...document.querySelectorAll('#ds-holdings-tokens div[data-token-id]')].map(detail=>({detail,row:detail.closest('tr'),id:detail.dataset.tokenId}));window.pendingClaimCard=document.querySelector('[data-token-id="1"] .wallet-token-legacy');document.querySelector('button[aria-controls="'+pendingClaimCard.closest('tr').id+'"]').click();`
			);
			await evaluate(
				`buttons(pendingClaimCard).find(b=>b.textContent.trim()==='More Details').click();`
			);
			await wait(`buttons(pendingClaimCard).some(b=>b.textContent.trim()==='Claim')`);
			await evaluate(
				`window.__holdClaim=true;[...pendingClaimCard.querySelectorAll('button')].find(b=>b.textContent.trim()==='Claim').click();`
			);
			await wait(`pendingClaimCard.textContent.includes('Claiming...')`);
			if (scenario === 'refresh') {
				await evaluate(`window.__holdTokens=true;clickText('Refresh tokens');`);
				await wait(`typeof window.__releaseTokens==='function'`);
			} else {
				await evaluate(`document.querySelectorAll('#ds-holdings-tokens thead button')[2].click();`);
			}
			assert.equal(
				await evaluate(
					`initialRows.every(({detail,row,id})=>row.isConnected && detail===document.querySelector('div[data-token-id="'+id+'"]') && row===detail.closest('tr'))`
				),
				true,
				'Loaded token rows retain membership and node identity during ' + scenario
			);
			assert.equal(
				await evaluate(
					`pendingClaimCard.isConnected && pendingClaimCard===document.querySelector('[data-token-id="1"] .wallet-token-legacy') && pendingClaimCard.textContent.includes('Claiming...')`
				),
				true,
				'Pending Claim retains its mounted money control during ' + scenario
			);
			if (scenario === 'refresh') {
				await evaluate(`__rejectTokens(new Error('Refresh refused'));`);
				await wait(
					`document.body.textContent.includes('Refresh failed. Showing the last loaded token balances.')`
				);
				assert.equal(
					await evaluate(
						`initialRows.every(({row})=>row.isConnected) && pendingClaimCard.isConnected`
					),
					true,
					'A failed same-wallet refresh keeps rows and pending Claim'
				);
			}
		} else if (scenario === 'dust') {
			await evaluate(
				`window.unknownRows=[...document.querySelectorAll('div[data-token-id^="unknown"]')];clickText('Show dust');`
			);
			assert.equal(
				await evaluate(
					`unknownRows.length===3 && unknownRows.every(row=>row.isConnected && row===document.querySelector('[data-token-id="'+row.dataset.tokenId+'"]'))`
				),
				true,
				'Show dust keeps all three unpriced row nodes mounted'
			);
			assert.equal(
				await evaluate(
					`document.querySelectorAll('#ds-holdings-tokens div[data-token-id]').length`
				),
				13,
				'Show dust expands the full population'
			);
			assert.equal(
				await evaluate(`buttons().some(b=>/Show \\d+ more tokens/.test(b.textContent))`),
				false,
				'Show dust removes the page limit permanently'
			);
		} else if (scenario === 'claim-hide' || scenario === 'claim-less') {
			await evaluate(`clickText('Show claimable tokens')`);
			await wait(`buttons().some(b=>/^Show \\d+ More$/.test(b.textContent.trim()))`);
			await evaluate(`buttons().find(b=>/^Show \\d+ More$/.test(b.textContent.trim())).click()`);
			await wait(`buttons().some(b=>b.textContent.trim()==='Show Less')`);
			await evaluate(
				`window.claimCards=[...document.querySelectorAll('.wallet-claim-legacy')];window.pendingCard=claimCards[6];window.firstCard=claimCards[0];window.__holdClaim=true;for(const card of [firstCard,pendingCard]) buttons(card).find(b=>b.textContent.trim()==='Claim').click();`
			);
			await wait(
				`firstCard.textContent.includes('Claiming...') && pendingCard.textContent.includes('Claiming...')`
			);
			await evaluate(
				scenario === 'claim-hide' ? `clickText('Hide claimable tokens')` : `clickText('Show Less')`
			);
			assert.equal(
				await evaluate(
					`pendingCard.isConnected && firstCard.isConnected && pendingCard.textContent.includes('Claiming...') && firstCard.textContent.includes('Claiming...')`
				),
				true,
				'Hiding claim cards retains the same connected cards with pending claims'
			);
			assert.equal(
				await evaluate(`visible(pendingCard)`),
				false,
				'The collapsed claim card is visually hidden'
			);
			assert.equal(
				await evaluate(`visible(firstCard)`),
				scenario !== 'claim-hide',
				'Only the requested claim cards are hidden'
			);
			await evaluate(
				scenario === 'claim-hide'
					? `clickText('Show claimable tokens')`
					: `buttons().find(b=>/^Show \\d+ More$/.test(b.textContent.trim())).click()`
			);
			assert.equal(
				await evaluate(
					`pendingCard===document.querySelectorAll('.wallet-claim-legacy')[6] && visible(pendingCard) && pendingCard.textContent.includes('Claiming...')`
				),
				true,
				'Showing claim cards restores visibility without replacing a pending card'
			);
		} else if (scenario === 'address-identity') {
			await evaluate(
				`window.previousRows=[...document.querySelectorAll('div[data-token-id]')].map(detail=>({detail,row:detail.closest('tr'),id:detail.dataset.tokenId}));clickText('Switch page');`
			);
			assert.equal(
				await evaluate(
					`previousRows.length>0 && previousRows.every(({detail,row,id})=>!row.isConnected && detail!==document.querySelector('div[data-token-id="'+id+'"]') && !!document.querySelector('div[data-token-id="'+id+'"]'))`
				),
				true,
				'Changing the page address replaces token and liquidity row instances for the same tokens'
			);
		} else if (scenario.startsWith('address-')) {
			await evaluate(
				`clickText('Show claimable tokens');window.__holdTokens=true;clickText('Refresh tokens');`
			);
			await wait(`typeof window.__releaseTokens==='function'`);
			assert.equal(
				await evaluate(
					`!!document.querySelector('.wallet-claim-legacy') && buttons().some(b=>b.textContent.trim()==='Claim All')`
				),
				true,
				'Same-wallet refresh retains claimable approvals'
			);
			await evaluate(`__holdTokens=false;__releaseTokens();`);
			await wait(`!buttons().find(b=>b.textContent.trim()==='Refresh tokens')?.disabled`);
			await evaluate(`clickText('Switch page');`);
			await wait(
				scenario === 'address-failure'
					? `document.body.textContent.includes('Token balances unavailable')`
					: `document.body.textContent.includes('No tokens in this account')`
			);
			assert.equal(
				await evaluate(
					`[...document.querySelectorAll('h3')].some(h=>h.textContent.trim()==='Claimable tokens') || buttons().some(b=>/^(Claim|Claim All|Show claimable tokens|Hide claimable tokens)$/.test(b.textContent.trim())) || !!document.querySelector('.wallet-claim-legacy')`
				),
				false,
				'An empty or failed new wallet has no Claimable section or claim controls'
			);
		} else if (scenario === 'keys') {
			await evaluate(`clickText('Show claimable tokens');`);
			await wait(`document.querySelectorAll('.wallet-claim-legacy').length===3`);
			await evaluate(
				`window.claimCards=[...document.querySelectorAll('.wallet-claim-legacy')];window.secondCard=claimCards[1];window.__holdClaim=true;[...secondCard.querySelectorAll('button')].find(b=>b.textContent.trim()==='Claim').click();`
			);
			await wait(`secondCard.textContent.includes('Claiming...')`);
			await evaluate(`__tokenPopulation=__tokenPopulation.slice(1);clickText('Refresh tokens');`);
			await wait(`document.querySelectorAll('.wallet-claim-legacy').length===2`);
			assert.equal(
				await evaluate(
					`secondCard.isConnected && secondCard===document.querySelectorAll('.wallet-claim-legacy')[0] && secondCard.textContent.includes('Asset 2') && !secondCard.textContent.includes('Asset 3') && secondCard.textContent.includes('Claiming...')`
				),
				true,
				'Removing the first claim card preserves the pending second instance and its token prop'
			);
		} else if (scenario === 'amount') {
			await evaluate(`clickText('Show claimable tokens');`);
			await wait(`buttons().some(b=>b.textContent.trim()==='Show 3 More')`);
			await evaluate(`clickText('Show 3 More');`);
			assert.equal(
				await evaluate(
					`(() => {const amounts=[...document.querySelectorAll('.wallet-claim-legacy')].map(card=>card.previousElementSibling.textContent.trim()); return amounts.length===9 && amounts.every(text=>/^0\\.004\\s/.test(text) && !/^0\\.00\\s/.test(text));})()`
				),
				true,
				'Both claim grids display 0.004 without rounding it to zero'
			);
		}
		console.log('PASS', scenario);
	}
	if (!cases.includes('controls')) {
		assert.equal(errors.length, 0, JSON.stringify(errors));
	} else {
		await open('controls');
		await evaluate(`clickText('Show dust');`);
		await evaluate(`clickText('Show claimable tokens');`);
		await evaluate(
			`[...document.querySelectorAll('#ds-holdings-tokens button[aria-expanded="false"],#ds-holdings-lp button[aria-expanded="false"]')].forEach(b=>b.click())`
		);
		await wait(`buttons().some(b=>b.textContent.includes('More Details'))`);
		await evaluate(
			`buttons().filter(b=>b.textContent.trim()==='More Details').forEach(b=>b.click())`
		);

		assert.equal(nftReads, 0, 'Ownership must not load at tab mount');
		await evaluate(`clickText('Show collectibles');`);
		await wait(`document.body.textContent.includes('Loading NFT ownership')`);
		assert.ok(pendingNft, 'First expansion starts ownership retrieval');
		assert.equal(
			await evaluate(`document.body.textContent.includes('0 NFTs')`),
			false,
			'No count before ownership succeeds'
		);
		await send('Fetch.fulfillRequest', {
			requestId: pendingNft,
			responseCode: 200,
			responseHeaders: [
				{ name: 'Content-Type', value: 'application/json' },
				{ name: 'Access-Control-Allow-Origin', value: '*' }
			],
			body: Buffer.from(
				JSON.stringify({ tokens: [{ contractId: 797609, tokenId: '7', metadata: 'broken' }] })
			).toString('base64')
		});
		await wait(
			`document.body.textContent.includes('1 NFTs') && document.body.textContent.includes('NFT #7') && document.body.textContent.includes('Some NFT metadata is unavailable')`
		);
		await evaluate(`clickText('Hide collectibles · 1 NFTs');`);
		await evaluate(`clickText('Show collectibles · 1 NFTs');`);
		assert.equal(nftReads, 1, 'Collapse and expand reuses retrieved ownership');
		for (const theme of ['light', 'dark']) {
			await evaluate(
				`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.classList.toggle('dark',${theme === 'dark'});`
			);
			for (const width of [320, 390, 768, 1024, 1440]) {
				await send('Emulation.setDeviceMetricsOverride', {
					width,
					height: 900,
					deviceScaleFactor: 1,
					mobile: false
				});
				const result = await evaluate(`(() => {
				const fail=message=>{throw new Error(message)};
				const targetRules=[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch{return []}}).filter(r=>r.selectorText?.includes('.wallet-') && r.style?.display==='none');
				if(targetRules.length!==1)fail('Expected one explicit adapter hide rule, got '+targetRules.length);
				const selectors=targetRules[0].selectorText.split(',').map(s=>s.trim());
				if(selectors.length!==4)fail('Expected four narrow adapter targets');
				const counts=[];
				for(const wrapper of document.querySelectorAll('.wallet-token-legacy')) {
					const lp=wrapper.hasAttribute('data-lp');
					const matches=selectors.slice(0,3).map(s=>[...wrapper.querySelectorAll(':scope'+s.slice(s.indexOf(' >')))]);
					const expected=lp?[1,wrapper.closest('[data-token-id]').dataset.tokenId==='lp-zero'?0:1,1]:[1,0,0];
					// The third selector is LP-only; preserve its wrapper attribute condition here.
					if(!lp)matches[2]=[];
					for(let i=0;i<3;i++) {if(matches[i].length!==expected[i])fail('Target '+i+' count '+matches[i].length);}
					const values=matches[0][0]; if(values.parentElement.children[0].querySelector('h4')===null || values!==values.parentElement.children[1])fail('Values block moved');
					for(const block of matches.flat()) {
						if(visible(block))fail('Read-only block still visible');
						if(block.querySelector('button,a,input,[role="button"]'))fail('Hidden control');
						if(/approval|approve|risk|warning|error|fee/i.test(block.textContent+' '+block.outerHTML.replace(/class="[^"]*"/g,'')))fail('Hidden risk text');
					}
					for(const badge of wrapper.querySelectorAll('h4 span'))if(!visible(badge))fail('Hidden approval badge');
					for(const control of wrapper.querySelectorAll('button,a'))if(!visible(control))fail('Hidden action '+control.textContent);else if(!control.disabled){control.focus();if(document.activeElement!==control)fail('Action cannot receive focus');}
					counts.push(expected);
				}
				const claims=document.querySelector('.wallet-claim-legacy');
				const amountTargets=claims.querySelectorAll(':scope > div:first-of-type > div:nth-of-type(2)');
				if(amountTargets.length!==1)fail('Claim amount target count moved');
				const amount=amountTargets[0];
				if(!amount || visible(amount) || amount.querySelector('button,a,input,[role="button"]') || /approval|approve|risk|warning|error|fee/i.test(amount.textContent))fail('Unsafe claim amount target');
				if(amount!==claims.firstElementChild.children[1])fail('Claim markup moved');
				for(const control of claims.querySelectorAll('button'))if(!visible(control))fail('Claim control hidden');
				const controls=buttons().map(b=>b.textContent.trim());
				for(const name of ['Less Details','Send','Approvals','Claim','Claim All'])if(!controls.includes(name))fail('Missing '+name);
				if(!buttons().some(b=>b.getAttribute('aria-label')==='Remove token from wallet'))fail('Opt-out unreachable');
				const tiny=document.querySelector('[data-token-id="tiny"] .wallet-token-legacy');
				if(!tiny || tiny.querySelector('button[aria-label="Remove token from wallet"]'))fail('Rounded display zero changed Opt-out availability');
				if(document.documentElement.scrollWidth>innerWidth)fail('Horizontal overflow '+document.documentElement.scrollWidth+' > '+innerWidth);
				return {width:innerWidth,counts};
			})()`);
				console.log(
					'PASS adapter controls, structural targets and layout',
					theme,
					width,
					result.counts.length
				);
			}
		}
		// A synthetic signing rejection exercises the real ClaimableTokenCard error surface.
		await evaluate(
			`const card=document.querySelector('.wallet-claim-legacy'); [...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='Claim').click();`
		);
		await wait(
			`document.querySelector('.wallet-claim-legacy').textContent.includes('Fixture signing refused')`
		);

		// Expanded rows keep their real controllers while a transaction is pending.
		// Hold only the transaction boundary; run the real FungibleToken claim handler and DataTable.
		await evaluate(
			`window.__holdClaim=true;window.pendingClaimCard=document.querySelector('[data-token-id="14"] .wallet-token-legacy');[...pendingClaimCard.querySelectorAll('button')].find(b=>b.textContent.trim()==='Claim').click();`
		);
		await wait(`pendingClaimCard.textContent.includes('Claiming...')`);
		const assertPendingController = async () => {
			assert.equal(
				await evaluate(
					`pendingClaimCard.isConnected && pendingClaimCard === document.querySelector('[data-token-id="14"] .wallet-token-legacy')`
				),
				true,
				'Expanded token 14 retains the same connected controller while Claim is pending'
			);
		};
		assert.equal(
			await evaluate(
				`buttons().concat([...document.querySelectorAll('a')]).some(el => /^(Show fewer|Show less|Hide dust|Collapse)$/i.test(el.textContent.trim()))`
			),
			false,
			'Expanded holdings expose no list collapse control'
		);
		await assertPendingController();
		// Sort both ways, close/reopen the detail, and change the selected wallet.
		for (const column of ['Token', 'Quantity', 'VOI equivalent', '≈USD']) {
			for (let direction = 0; direction < 2; direction++) {
				await evaluate(
					`document.querySelector('#ds-holdings-tokens th').closest('thead').querySelectorAll('button')[${['Token', 'Quantity', 'VOI equivalent', '≈USD'].indexOf(column)}].click()`
				);
				await assertPendingController();
			}
		}
		for (let n = 0; n < 2; n++) {
			await evaluate(
				`document.querySelector('button[aria-controls="'+pendingClaimCard.closest('tr').id+'"]').click()`
			);
			await assertPendingController();
		}
		for (let n = 0; n < 2; n++) {
			await evaluate(`clickText('Toggle signing')`);
			await assertPendingController();
		}
		assert.equal(
			await evaluate(`pendingClaimCard.isConnected`),
			true,
			'Pending approval Claim remains mounted after the available controls are exercised'
		);
		console.log(
			'PASS one-way expansion retains the same pending Claim controller through sorting, detail toggles and wallet changes'
		);
		assert.equal(errors.length, 0, JSON.stringify(errors));
		if (process.env.HOLDINGS_SHOT_DIR) {
			await mkdir(process.env.HOLDINGS_SHOT_DIR, { recursive: true });
			const shot = await send('Page.captureScreenshot', {
				format: 'png',
				captureBeyondViewport: true
			});
			await writeFile(
				resolve(process.env.HOLDINGS_SHOT_DIR, 'holdings.png'),
				Buffer.from(shot.data, 'base64')
			);
		}
		console.log('PASS real claim error remains visible; no external requests permitted');
	}
} finally {
	ws?.close();
	browser?.kill();
	await server?.close();
	await rm(profile, { recursive: true, force: true });
}
