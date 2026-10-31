import { json } from '@sveltejs/kit';
import { validatePhase2Pagination } from '$lib/server/validate';
import { supabasePublicClient } from '$lib/supabase';
import { UPSTREAM_TIMEOUT_MS } from '$lib/server/fetchWithTimeout';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

const DEFAULT_PAGE_SIZE = 1000;
const archiveHeaders = {
	...corsHeaders,
	'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
};

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	const wallet = url.searchParams.get('wallet');
	const fetchAll = url.searchParams.get('fetchAll') === 'true';
	const combine = url.searchParams.get('combine') === 'true';
	const csv = url.searchParams.get('csv') === 'true';
	const pagination = validatePhase2Pagination(url.searchParams);
	if ('error' in pagination) {
		return json({ error: pagination.error }, { status: 400, headers: corsHeaders });
	}
	const { page, pageSize } = pagination;

	if (!wallet && !fetchAll) {
		return json(
			{ error: 'Missing required parameter: wallet or fetchAll' },
			{
				status: 400,
				headers: corsHeaders
			}
		);
	}

	try {
		if (fetchAll) {
			if (combine || csv) {
				// First get total count
				const { count, error: countError } = await supabasePublicClient
					.from('vr_phase2')
					.select('*', { count: 'exact', head: true })
					.not('blacklisted', 'is', true)
					.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));
				// TASK-92: a failed or timed-out count is an error, not an empty export.
				if (countError) throw countError;

				if (!count) {
					return csv
						? new Response('address,airdrop_amount\n', {
								headers: {
									...archiveHeaders,
									'Content-Type': 'text/csv',
									'Content-Disposition': 'attachment; filename="phase2_airdrop.csv"'
								}
							})
						: json({ wallets: [] }, { headers: archiveHeaders });
				}

				// Calculate number of requests needed
				const batches = Math.ceil(count / DEFAULT_PAGE_SIZE);
				const allWallets = [];
				let csvContent = csv ? 'address,airdrop_amount\n' : '';

				// Fetch all batches
				for (let i = 0; i < batches; i++) {
					const { data, error } = await supabasePublicClient
						.from('vr_phase2')
						.select('address, airdrop_amount')
						.not('blacklisted', 'is', true)
						.order('address', { ascending: true })
						.range(i * DEFAULT_PAGE_SIZE, (i + 1) * DEFAULT_PAGE_SIZE - 1)
						.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));

					if (error) throw error;

					if (csv) {
						csvContent +=
							data
								.map((item) => `${item.address},${(item.airdrop_amount ?? 0).toFixed(6)}`)
								.join('\n') + '\n';
					} else {
						allWallets.push(
							...data.map((item) => ({
								wallet: item.address,
								estimatedReward: Number((item.airdrop_amount ?? 0).toFixed(6))
							}))
						);
					}
				}

				if (csv) {
					return new Response(csvContent, {
						headers: {
							...archiveHeaders,
							'Content-Type': 'text/csv',
							'Content-Disposition': 'attachment; filename="phase2_airdrop.csv"'
						}
					});
				}

				return json(
					{ wallets: allWallets },
					{
						headers: archiveHeaders
					}
				);
			}

			// Existing paginated query logic
			const {
				data: allData,
				error: allError,
				count
			} = await supabasePublicClient
				.from('vr_phase2')
				.select('address, airdrop_amount', { count: 'exact' })
				.not('blacklisted', 'is', true)
				.order('address', { ascending: true })
				.range((page - 1) * pageSize, page * pageSize - 1)
				.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));

			if (allError) {
				throw allError;
			}

			const wallets = allData.map((item) => ({
				wallet: item.address,
				estimatedReward: Number((item.airdrop_amount ?? 0).toFixed(6))
			}));

			const totalPages = Math.ceil((count ?? 0) / pageSize);

			return json(
				{
					wallets,
					pagination: {
						page,
						pageSize,
						totalPages,
						totalCount: count
					}
				},
				{
					headers: archiveHeaders
				}
			);
		} else {
			const { data: questData, error: questError } = await supabasePublicClient
				.from('vr_phase2')
				.select('airdrop_amount')
				.eq('address', wallet)
				.not('blacklisted', 'is', true)
				.abortSignal(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
				.maybeSingle();

			// TASK-92: maybeSingle gives no row as null data; any error (failure, timeout, more than one row) is a 500.
			if (questError) throw questError;
			if (!questData) {
				return json(
					{ error: 'Address not found' },
					{
						status: 404,
						headers: corsHeaders
					}
				);
			}

			const estimatedReward = questData?.airdrop_amount ?? 0;

			return json(
				{
					wallet,
					estimatedReward
				},
				{
					headers: corsHeaders
				}
			);
		}
	} catch (error) {
		console.error('Error retrieving airdrop amounts:', error);
		return json(
			{ error: 'An error occurred while retrieving airdrop amounts' },
			{
				status: 500,
				headers: corsHeaders
			}
		);
	}
}

export function OPTIONS() {
	return new Response(null, {
		headers: corsHeaders
	});
}
