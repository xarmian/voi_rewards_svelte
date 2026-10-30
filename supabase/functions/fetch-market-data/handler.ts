import { timingSafeEqual } from 'https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts';

export interface MarketSnapshot {
	trading_pair_id: number;
	price: number;
	volume_24h: number | null;
	tvl?: number;
	high_24h?: number;
	low_24h?: number;
	price_change_24h?: number;
	price_change_percentage_24h?: number;
}

export interface HandlerDeps {
	sources: { name: string; fetch: () => Promise<MarketSnapshot | null> }[];
	insert: (snapshots: MarketSnapshot[]) => Promise<void>;
	requireServiceRole: boolean;
	serviceRoleKey: string;
	sourceTimeoutMs: number;
	logger: Pick<Console, 'error'>;
	timers?: {
		setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
		clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
	};
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export function createHandler(deps: HandlerDeps) {
	// Call the globals unbound: Deno 1 (the edge runtime) throws 'Illegal invocation' when a timer
	// runs with a foreign `this`, which made every deadline reject at once in prod (TASK-47).
	const timers = deps.timers ?? {
		setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
		clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id)
	};
	const encoder = new TextEncoder();
	const expectedAuthorization = encoder.encode(`Bearer ${deps.serviceRoleKey}`);

	return async (req: Request) => {
		// Handle CORS preflight requests
		if (req.method === 'OPTIONS') {
			return new Response('ok', { headers: corsHeaders });
		}

		if (deps.requireServiceRole) {
			const authorization = encoder.encode(req.headers.get('Authorization') ?? '');
			if (
				!deps.serviceRoleKey ||
				authorization.byteLength !== expectedAuthorization.byteLength ||
				!timingSafeEqual(authorization, expectedAuthorization)
			) {
				return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
					status: 401,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}
		}

		try {
			const results = await Promise.all(
				deps.sources.map(async (source) => {
					let timeoutId: ReturnType<typeof setTimeout> | undefined;
					const deadline = new Promise<null>((resolve) => {
						timeoutId = timers.setTimeout(() => {
							deps.logger.error(`Source ${source.name} timed out after ${deps.sourceTimeoutMs} ms`);
							resolve(null);
						}, deps.sourceTimeoutMs);
					});
					try {
						return await Promise.race([source.fetch(), deadline]);
					} catch (error) {
						// One failing source must not discard the others' snapshots.
						deps.logger.error(`Source ${source.name} failed:`, error);
						return null;
					} finally {
						if (timeoutId !== undefined) timers.clearTimeout(timeoutId);
					}
				})
			);
			const snapshots = results.filter((data): data is MarketSnapshot => data !== null);

			if (snapshots.length === 0) {
				// Every source failing is an outage; a 200 here hid the 10-30 prod incident (TASK-47).
				const error = 'No market source returned data';
				deps.logger.error(error);
				return new Response(JSON.stringify({ success: false, error, snapshots_count: 0 }), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					status: 502
				});
			}

			await deps.insert(snapshots);

			return new Response(
				JSON.stringify({
					success: true,
					snapshots_count: snapshots.length
				}),
				{
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					status: 200
				}
			);
		} catch (error) {
			deps.logger.error('Error in fetch-market-data function:', error);
			return new Response(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error occurred'
				}),
				{
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					status: 500
				}
			);
		}
	};
}
