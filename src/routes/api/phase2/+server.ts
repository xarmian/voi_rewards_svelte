import { json } from '@sveltejs/kit';
import { supabasePublicClient } from '$lib/supabase';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

const DEFAULT_PAGE_SIZE = 1000;

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    const wallet = url.searchParams.get('wallet');
    const fetchAll = url.searchParams.get('fetchAll') === 'true';
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE.toString(), 10);

    if (!wallet && !fetchAll) {
        return json({ error: 'Missing required parameter: wallet or fetchAll' }, { 
            status: 400,
            headers: corsHeaders
        });
    }

    try {
        if (fetchAll) {
            const { data: allData, error: allError, count } = await supabasePublicClient
                .from('vr_phase2')
                .select('address, airdrop_amount', { count: 'exact' })
                .order('address', { ascending: true })
                .range((page - 1) * pageSize, page * pageSize - 1);

            if (allError) {
                throw allError;
            }

            const totalPages = Math.ceil((count ?? 0) / pageSize);

            return json({ 
                wallets: allData.map(item => ({
                    wallet: item.address,
                    estimatedReward: Number((item.airdrop_amount ?? 0).toFixed(6))
                })),
                pagination: {
                    page,
                    pageSize,
                    totalPages,
                    totalCount: count
                }
            }, {
                headers: corsHeaders
            });
        } else {
            const { data: questData, error: questError } = await supabasePublicClient
                .from('vr_phase2')
                .select('airdrop_amount')
                .eq('address', wallet)
                .single();

            if (questError) {
                return json({ error: 'Address not found' }, { 
                    status: 404,
                    headers: corsHeaders
                });
            }

            const estimatedReward = questData?.airdrop_amount ?? 0;

            return json({ 
                wallet,
                estimatedReward 
            }, {
                headers: corsHeaders
            });
        }
    } catch (error) {
        console.error('Error retrieving airdrop amounts:', error);
        return json({ error: 'An error occurred while retrieving airdrop amounts' }, { 
            status: 500,
            headers: corsHeaders
        });
    }
}

export function OPTIONS() {
    return new Response(null, {
        headers: corsHeaders
    });
}