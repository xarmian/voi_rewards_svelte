import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { supabasePrivateClient as supabase } from '$lib/supabase-server';
import { verifyToken } from 'avm-wallet-svelte';

export const load: PageServerLoad = async ({ params, cookies, url, locals }) => {
    const user = locals.user;
    const wallets = [];

    // get all addresses connected to user's discord id
    if (user && user.user_metadata && user.user_metadata.provider_id) {
        // select * from users using supabase api
        const { data, error: supaError } = await supabase
            .from('addresses')
            .select(`
                address,
                is_primary,
                users (
                    discord_id
                )
            `)
            .eq('users.discord_id', user.user_metadata.provider_id);

        if (supaError) {
            console.error('Error fetching user and addresses:', error);
        } else if (data) {
            //console.log('User:', data);
            wallets.push(...data);
        } else {
            console.log('No user found with the given Discord ID');
        }
    }

    return {
        server_data: { user, wallets },
    }
}

export const actions = {
    setPrimaryWallet: async ({ request, params, cookies, locals }) => {
        const formData = await request.formData();
        const wallet = formData.get('wallet')?.toString();

        // verify the token
        const token = cookies.get(`avm-wallet-token-${wallet}`);
        const isValid = (wallet && token) ? await verifyToken(wallet, token) : false;

        if (!isValid) {
            error(401, 'Invalid wallet token');
        }

        // get user's discord ID
        const authUser = await locals.getUser();
        const discordId = authUser?.user_metadata?.provider_id;

        // get user's uuid from users table using discord_id
        const { data: user, error: supaError } = await supabase
            .from('users')
            .select('id')
            .eq('discord_id', discordId)
            .single();

        if (supaError) {
            error(500, 'Failed to fetch user information');
        }

        if (!user) {
            error(404, 'User not found');
        }

        // set all addresses as not primary
        const { error: unsetError } = await supabase
            .from('addresses')
            .update({ is_primary: false })
            .eq('user_id', user.id);

        if (unsetError) {
            error(500, 'Failed to update wallet information');
        }

        // set the selected address as primary
        const { error: setPrimaryError } = await supabase
            .from('addresses')
            .update({ is_primary: true })
            .eq('user_id', user.id)
            .eq('address', wallet);

        if (setPrimaryError) {
            error(500, 'Failed to update wallet information');
        }

        return {
            status: 200,
            body: { success: true },
        };
    },
}