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
						return `import {tokens} from '/src/lib/ds/WalletHoldings/fixtures.ts'; export const fetchFungibleTokens = async () => ({tokens,partial:false});`;
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
		optimizeDeps: { include: ['svelte', 'svelte/store', 'flowbite-svelte', 'algosdk', 'ulujs'] }
	});
	await server.listen();
	browser = spawn(
		process.env.HOLDINGS_CHROMIUM ||
			'/home/dave/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
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
	await send('Page.navigate', { url: 'http://127.0.0.1:4182/__holdings' });
	await wait(`document.querySelector('#ds-holdings-tokens')`);
	await evaluate(
		`window.visible = el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; window.buttons = (root=document) => [...root.querySelectorAll('button')].filter(visible); window.clickText = text => { const b=buttons().find(b=>b.textContent.trim()===text); if(!b)throw new Error('Missing button '+text); b.click(); };`
	);
	await evaluate(`clickText('Show dust');`);
	await wait(`buttons().some(b=>b.textContent.trim()==='Show 6 more tokens')`);
	await evaluate(`clickText('Show 6 more tokens'); clickText('Show claimable tokens');`);
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

	// Section 9 requires a pending money component to survive collapsing the top-ten view.
	// Hold only the transaction boundary; run the real FungibleToken claim handler and DataTable.
	await evaluate(
		`window.__holdClaim=true;window.pendingClaimCard=document.querySelector('[data-token-id="14"] .wallet-token-legacy');[...pendingClaimCard.querySelectorAll('button')].find(b=>b.textContent.trim()==='Claim').click();`
	);
	await wait(`pendingClaimCard.textContent.includes('Claiming...')`);
	await evaluate(`clickText('Show fewer');`);
	assert.equal(
		await evaluate(`pendingClaimCard.isConnected`),
		true,
		'Section 9: Show fewer must retain the mounted row 14 money controller while its Claim is pending'
	);
	assert.equal(errors.length, 0, JSON.stringify(errors));
	await mkdir('/tmp/task-152-browser', { recursive: true });
	const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
	await writeFile('/tmp/task-152-browser/holdings.png', Buffer.from(shot.data, 'base64'));
	console.log('PASS real claim error remains visible; no external requests permitted');
} finally {
	ws?.close();
	browser?.kill();
	await server?.close();
	await rm(profile, { recursive: true, force: true });
}
