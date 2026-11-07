import { isEqual } from 'lodash-es';
import { browser } from '$app/environment';
import { fetchFungibleTokens } from '$lib/services/accounts';
import type { FungibleTokenType, NFTToken } from '$lib/types/assets';
import type { AccountSnapshot, Part } from '$lib/portfolio/accountDetails';
import type { DataState } from '$lib/ds/types';
import { compact } from '$lib/ds/format';
import { resolveEnvoiToken } from '$lib/utils/envoi';

export type HoldingsAccount = Part<AccountSnapshot> | { status: 'loading' };
export type HoldingsSplit = {
	pageAddress: string;
	owner: { address: string; balance: number } | null;
	contracts: { address: string; balance: number; details: { lockedBalance: number } | null }[];
	contractSet: 'ready' | 'unavailable';
};
export type HoldingsRow = {
	key: string;
	token: FungibleTokenType;
	quantity: number | null;
	value: number | null;
	valueLabel: string;
	usd: number | null;
	underlying: { symbol: string; amount: number }[] | null;
};

const nonnegative = (n: unknown): n is number =>
	typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const decimalsKnown = (n: unknown): n is number =>
	Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255;
const validToken = (token: FungibleTokenType) =>
	!!token &&
	typeof token.id === 'string' &&
	nonnegative(token.balance) &&
	Number.isInteger(token.balance) &&
	decimalsKnown(token.decimals);

const holdingsId = (id: unknown) => `${typeof id}:${id}`;

export function holdingsClaimKey(
	items: { token: { id: unknown } }[],
	index: number,
	address: string | undefined
) {
	const id = holdingsId(items[index].token.id);
	const occurrence = items
		.slice(0, index)
		.filter((item) => holdingsId(item.token.id) === id).length;
	return `${address}:${id}${occurrence ? ':' + occurrence : ''}`;
}

export const holdingsAmount = (n: number | null) =>
	n === null ? 'Unavailable' : n > 0 && n < 0.01 ? '<0.01' : compact(n, 2);

export function holdingsExactQuantity(
	token: Pick<FungibleTokenType, 'balance' | 'decimals'>
): string {
	if (
		!nonnegative(token.balance) ||
		!Number.isInteger(token.balance) ||
		!decimalsKnown(token.decimals)
	)
		return 'Unavailable';
	if (!Number.isSafeInteger(token.balance)) return `≈ ${token.balance / 10 ** token.decimals}`;
	const units = BigInt(token.balance).toString();
	if (token.decimals === 0) return units;
	const digits = units.padStart(token.decimals + 1, '0');
	const fraction = digits.slice(-token.decimals).replace(/0+$/, '');
	return digits.slice(0, -token.decimals) + (fraction ? `.${fraction}` : '');
}

/** Rows hold references to the service objects. Formatting/filtering must never change money inputs. */
export function deriveHoldingsRows(
	tokens: FungibleTokenType[],
	{
		pageAddress = '',
		showDust = false,
		partial = false,
		remembered = new Set<string>()
	}: {
		pageAddress?: string;
		showDust?: boolean;
		partial?: boolean;
		remembered?: ReadonlySet<string>;
	} = {}
) {
	const seen = new Map<string, FungibleTokenType[]>();
	const all: HoldingsRow[] = [];
	for (const token of tokens) {
		const id = holdingsId(token.id);
		const baseKey = `${pageAddress}:${token.type ?? 'vsa'}:${id}`;
		const entries = seen.get(baseKey) ?? [];
		if (entries.some((entry) => isEqual(entry, token))) continue;
		const occurrence = entries.length;
		const key = `${baseKey}${occurrence ? ':' + occurrence : ''}`;
		entries.push(token);
		seen.set(baseKey, entries);
		const valid = validToken(token);
		const quantity = valid ? token.balance / 10 ** token.decimals : null;
		// The service uses zero as its unavailable valuation placeholder. Positive raw balances cannot prove $0.
		const value =
			valid && nonnegative(token.value) && (token.value > 0 || token.balance === 0)
				? token.value
				: null;
		const usd =
			valid && nonnegative(token.usdValue) && (token.usdValue > 0 || token.balance === 0)
				? token.usdValue
				: null;
		let underlying: HoldingsRow['underlying'] = null;
		const pool = token.poolInfo;
		if (
			pool &&
			valid &&
			!partial &&
			nonnegative(token.balance) &&
			nonnegative(pool.totalSupply) &&
			pool.totalSupply > 0 &&
			token.balance <= pool.totalSupply &&
			pool.tokABalance !== undefined &&
			pool.tokBBalance !== undefined &&
			/^\d+$/.test(pool.tokABalance) &&
			/^\d+$/.test(pool.tokBBalance) &&
			decimalsKnown(pool.tokADecimals) &&
			decimalsKnown(pool.tokBDecimals)
		) {
			const share = token.balance / pool.totalSupply;
			const a = (share * Number(pool.tokABalance)) / 10 ** pool.tokADecimals;
			const b = (share * Number(pool.tokBBalance)) / 10 ** pool.tokBDecimals;
			if (nonnegative(a) && nonnegative(b))
				underlying = [
					{ symbol: pool.tokASymbol ?? 'Token A', amount: a },
					{ symbol: pool.tokBSymbol ?? 'Token B', amount: b }
				];
		}
		all.push({
			key,
			token,
			quantity,
			value,
			valueLabel: value === null ? 'Unavailable' : `${holdingsAmount(value)} VOI`,
			usd,
			underlying
		});
	}
	return {
		all,
		tokens: all.filter(
			(row) =>
				!row.token.poolInfo &&
				(showDust ||
					remembered.has(row.key) ||
					row.quantity === null ||
					(row.value === null && row.token.balance > 0) ||
					(row.value ?? 0) > 0.1 ||
					(row.token.approvals?.length ?? 0) > 0 ||
					(row.token.outgoingApprovals?.length ?? 0) > 0)
		),
		lp: all.filter((row) => row.token.poolInfo)
	};
}

export function deriveHoldingsDisplay({
	pageAddress,
	parentWalletAddress = null,
	account,
	tokens,
	partial = false,
	tokenState = 'ready',
	split,
	price = null,
	showDust = false,
	remembered = new Set<string>()
}: {
	pageAddress: string;
	parentWalletAddress?: string | null;
	account: HoldingsAccount;
	tokens: FungibleTokenType[];
	partial?: boolean;
	tokenState?: DataState;
	split?: HoldingsSplit;
	price?: number | null;
	showDust?: boolean;
	remembered?: ReadonlySet<string>;
}) {
	const rows = deriveHoldingsRows(tokens, { pageAddress, showDust, partial, remembered });
	const pageLiquid = account.status === 'loaded' ? account.value.balance / 1e6 : null;
	const contracts =
		split?.pageAddress === pageAddress
			? [...new Map(split.contracts.map((c) => [c.address, c])).values()]
			: [];
	const nativeReady =
		split?.pageAddress === pageAddress &&
		split.contractSet === 'ready' &&
		(!parentWalletAddress || contracts.some((c) => c.address === pageAddress)) &&
		contracts.every(
			(c) => c.details && nonnegative(c.balance) && nonnegative(c.details.lockedBalance)
		);
	const locked = nativeReady
		? contracts.reduce((sum, c) => sum + Math.min(c.balance, c.details!.lockedBalance / 1e6), 0)
		: null;
	const unlocked = nativeReady ? contracts.reduce((sum, c) => sum + c.balance, 0) - locked! : null;
	const liquid = nativeReady
		? contracts.some((c) => c.address === pageAddress)
			? 0
			: pageLiquid
		: null;
	const valuesReady =
		!partial &&
		(tokenState === 'ready' || tokenState === 'empty') &&
		rows.all.every((row) => row.value !== null && row.quantity !== null);
	const lp = rows.lp.every((r) => r.value !== null)
		? rows.lp.reduce((sum, r) => sum + r.value!, 0)
		: null;
	const regular = rows.all.filter((r) => !r.token.poolInfo);
	const other =
		unlocked !== null && regular.every((r) => r.value !== null)
			? unlocked + regular.reduce((sum, r) => sum + r.value!, 0)
			: null;
	const total =
		nativeReady &&
		valuesReady &&
		liquid !== null &&
		locked !== null &&
		lp !== null &&
		other !== null
			? liquid + locked + lp + other
			: null;
	const parts = [
		{ label: 'Locked', value: locked, color: 'bg-accent-fill' },
		{ label: 'LP', value: valuesReady ? lp : null, color: 'bg-hi' },
		{ label: 'Tokens and other', value: valuesReady ? other : null, color: 'bg-series-3' },
		{ label: 'Liquid', value: liquid, color: 'bg-ink-muted' }
	];
	return {
		rows,
		pageLiquid,
		parts,
		total,
		usd: total !== null && price !== null && price > 0 ? total * price : null,
		composition: total !== null ? parts : null
	};
}

async function bounded<T>(read: Promise<T>, label: string, timeout = 15000): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			read,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`${label} timed out after ${timeout / 1000} seconds`)),
					timeout
				);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}
type TokenResult = { tokens: FungibleTokenType[]; partial: boolean };
type FetchTokens = (address: string | undefined, price: number) => Promise<TokenResult>;

export async function loadHoldingsTokens(
	address: string | undefined,
	price: number,
	isCurrent = () => true,
	fetchTokens: FetchTokens = fetchFungibleTokens
): Promise<TokenResult> {
	if (!browser || !address) throw new Error('A browser wallet address is required');
	const result = await bounded(fetchTokens(address, price), 'Token balances', 60000);
	if (!isCurrent()) throw new Error('Holdings request superseded');
	if (!result || !Array.isArray(result.tokens) || typeof result.partial !== 'boolean')
		throw new Error('Invalid token population');
	return result.tokens.every(validToken) ? result : { ...result, partial: true };
}

/** One loader per controller, so a late read cannot overwrite a newer address or refresh. No SSR stores. */
export function createHoldingsTokenLoader(fetchTokens: FetchTokens = fetchFungibleTokens) {
	let generation = 0;
	let currentAddress: string | undefined;
	return (address: string | undefined, price: number) => {
		const request = ++generation;
		currentAddress = address;
		return loadHoldingsTokens(
			address,
			price,
			() => request === generation && currentAddress === address,
			fetchTokens
		);
	};
}

const nftOwnership = new Map<string, NFTToken[]>();
export const nftUrl = (contractId: string, tokenId: string) =>
	`https://nftnavigator.xyz/collection/${contractId}/token/${tokenId}`;
export function nftImage(image: string, metadataURI?: string) {
	if (!image) return '/icons/default-token-image.svg';
	if (image.includes('highforge.io') && !image.includes('?') && metadataURI)
		return `https://prod.cdn.highforge.io/i/${encodeURIComponent(metadataURI)}?w=200`;
	return image.replace('ipfs://', 'https://ipfs.io/ipfs/');
}

export async function loadWalletNfts(address: string, force = false): Promise<NFTToken[]> {
	if (!browser || !address) throw new Error('A browser wallet address is required');
	if (!force && nftOwnership.has(address)) return nftOwnership.get(address)!;
	const result = await bounded(
		(async () => {
			const url = new URL('https://voi-mainnet-mimirapi.nftnavigator.xyz/nft-indexer/v1/tokens');
			url.searchParams.set('owner', address);
			const response = await fetch(url);
			if (!response.ok) throw new Error('NFT ownership unavailable');
			const data = await response.json();
			if (
				!Array.isArray(data.tokens) ||
				data.tokens.some((t: NFTToken) => t.contractId == null || t.tokenId == null)
			)
				throw new Error('Invalid NFT ownership response');
			return data.tokens.map((raw: NFTToken) => {
				let metadata: NFTToken['metadata'];
				try {
					metadata = typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata;
				} catch {
					/* ownership is independent of metadata */
				}
				return {
					contractId: String(raw.contractId),
					tokenId: String(raw.tokenId),
					owner: raw.owner,
					metadataURI: raw.metadataURI,
					name: typeof metadata?.name === 'string' ? metadata.name : `NFT #${raw.tokenId}`,
					imageUrl: typeof metadata?.image === 'string' ? metadata.image : '',
					metadata
				};
			}) as NFTToken[];
		})(),
		'NFT ownership'
	);
	nftOwnership.set(address, result);
	return result;
}

/** Port of the old read-only collection/enVoi enrichment; failure never discards an owned ID. */
export async function enrichWalletNfts(
	owned: NFTToken[]
): Promise<{ tokens: NFTToken[]; partial: boolean }> {
	let partial = owned.some((t) => !t.metadata?.name || !t.imageUrl);
	const collections = new Map<string, NFTToken['collection']>();
	await Promise.all(
		[...new Set(owned.map((t) => t.contractId))].map(async (contractId) => {
			try {
				const collection = await bounded(
					(async () => {
						const response = await fetch(
							`https://voi-mainnet-mimirapi.nftnavigator.xyz/nft-indexer/v1/collections?contractId=${contractId}`
						);
						if (!response.ok) throw new Error('Collection metadata unavailable');
						const data = await response.json();
						if (!data.collections?.[0]) throw new Error('Collection metadata missing');
						return data.collections[0];
					})(),
					'Collection metadata'
				);
				collections.set(contractId, collection);
			} catch {
				partial = true;
			}
		})
	);
	const tokens = owned.map((t) => ({ ...t, collection: collections.get(t.contractId) }));
	const envoi = tokens.filter((t) => t.contractId === '797609' || t.contractId === '876578');
	if (envoi.length) {
		try {
			const names = await bounded(resolveEnvoiToken(envoi.map((t) => t.tokenId)), 'NFT names');
			for (const token of envoi) {
				const match = names.find((n) => n.token_id === token.tokenId);
				if (!match) {
					partial = true;
					continue;
				}
				token.name = match.name + (token.contractId === '876578' ? ' (VSR)' : '');
				if (match.metadata.avatar) token.imageUrl = match.metadata.avatar;
			}
		} catch {
			partial = true;
		}
	}
	return { tokens, partial };
}
