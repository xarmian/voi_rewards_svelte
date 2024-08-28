import { json } from '@sveltejs/kit';
import { supabasePrivateClient } from '$lib/supabase-server';

export async function GET({ url }) {
    const wallet = url.searchParams.get('wallet');

    if (!wallet) {
        return json({ error: 'Wallet address is required' }, { status: 400 });
    }

    try {
        const { data, error } = await supabasePrivateClient
            .from('addresses')
            .select('address')
            .eq('address', wallet)
            .eq('disconnected',false);

        if (error) {
            throw error;
        }

        const isEligible = data.length > 0;

        return json({ isEligible });
    } catch (error) {
        console.error('Error checking eligibility:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
}
