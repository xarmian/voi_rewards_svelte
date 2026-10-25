function isIntegerString(value: string): boolean {
	return value.length > 0 && !/\D/.test(value);
}

function parseInteger(value: string, min: number, max = Infinity): number | null {
	if (!isIntegerString(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

export function validateBallastLookback(value: string | null): number | null {
	return value === null ? 5 : parseInteger(value, 1, 50);
}

export function validatePhase2Pagination(
	params: URLSearchParams
): { page: number; pageSize: number } | { error: string } {
	for (const key of ['page', 'pageSize']) {
		if (params.getAll(key).length > 1) return { error: `Duplicate parameter: ${key}` };
	}
	const page = parseInteger(params.get('page') ?? '1', 1, 1_000_000);
	if (page === null) return { error: 'page must be an integer between 1 and 1000000' };
	const pageSize = parseInteger(params.get('pageSize') ?? '1000', 1, 1000);
	if (pageSize === null) return { error: 'pageSize must be an integer between 1 and 1000' };
	return { page, pageSize };
}

function parseAddress(value: string): string | null {
	return value.length === 58 && /^[A-Z2-7]{58}$/.test(value) ? value : null;
}

function parseAddressArray(value: string): string[] | null {
	if (!value.startsWith('{') || !value.endsWith('}')) return null;
	const addresses = value.slice(1, -1).split(',');
	return addresses.length >= 1 && addresses.length <= 10 && addresses.every(parseAddress)
		? addresses
		: null;
}

type RpcParam = string | number | string[];
type ParamParser = (value: string) => RpcParam | null;

const mimirSchemas: Record<string, Record<string, ParamParser>> = {
	get_online_account_count: {},
	get_tx_counts: {
		p_period: (value) => (value === 'day' || value === 'week' ? value : null),
		p_n: (value) => parseInteger(value, 1, 60)
	},
	get_arc200_transfers: {
		p_contractid: (value) => parseInteger(value, 0),
		p_user: parseAddress,
		p_limit: (value) => parseInteger(value, 1, 100),
		p_offset: (value) => parseInteger(value, 0, 100000)
	},
	get_account_transactions_multi: {
		from_addresses: parseAddressArray,
		to_address: parseAddress
	}
};

export function validateMimirParams(
	searchParams: URLSearchParams
): { action: string; params: Record<string, RpcParam> } | { error: string } {
	const seen = new Set<string>();
	for (const key of searchParams.keys()) {
		if (seen.has(key)) return { error: `Duplicate parameter: ${key}` };
		seen.add(key);
	}
	const action = searchParams.get('action') ?? 'get_online_account_count';
	if (!Object.keys(mimirSchemas).includes(action)) {
		return {
			error: `Invalid action. Allowed actions are: ${Object.keys(mimirSchemas).join(', ')}`
		};
	}
	const schema = mimirSchemas[action];
	for (const key of searchParams.keys()) {
		if (key !== 'action' && !Object.keys(schema).includes(key)) {
			return { error: `Unknown parameter: ${key}` };
		}
	}

	const params: Record<string, RpcParam> = {};
	for (const [key, parse] of Object.entries(schema)) {
		const value = searchParams.get(key);
		if (value === null) return { error: `Missing required parameter: ${key}` };
		const parsed = parse(value);
		if (parsed === null) return { error: `Invalid parameter: ${key}` };
		params[key] = parsed;
	}
	return { action, params };
}

export function pgrstQuote(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function validateTokenSearch(value: string | null, parameter: string): string | null {
	if (value !== null && value.length > 64) {
		return `${parameter} must contain at most 64 characters`;
	}
	return null;
}

export function validateTokenPairFilters(params: URLSearchParams): string | null {
	const tokenId = params.get('tokenId');
	if (tokenId !== null && !isIntegerString(tokenId)) {
		return 'tokenId must be a non-negative integer string';
	}
	return (
		validateTokenSearch(params.get('q'), 'q') ??
		validateTokenSearch(params.get('tokenSymbol'), 'tokenSymbol')
	);
}

export function validateTokenPairIds(baseTokenId: unknown, quoteTokenId: unknown): string | null {
	for (const [key, value] of Object.entries({ baseTokenId, quoteTokenId })) {
		if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
			return `${key} must be a non-negative safe integer`;
		}
	}
	return null;
}
