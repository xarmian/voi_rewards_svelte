import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { supabasePrivateClient as supabasePrivateClient } from '$lib/supabase-server';
import { verifyToken } from 'avm-wallet-svelte';

export const load: PageServerLoad = async ({ params, cookies, url, locals }) => {
    const user = (await locals.getSession())?.user;
    
    const wallets = [];

    // get all addresses connected to user's discord id
    if (user && user.user_metadata && user.user_metadata.provider_id) {
        const { data, error: supaError } = await supabasePrivateClient
            .from('addresses')
            .select(`
                address,
                is_primary,
                users!inner (
                    discord_id
                )
            `)
            .eq('users.discord_id', user.user_metadata.provider_id)
            .eq('disconnected', false);
            
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
        const authUser = (await locals.getSession())?.user;
        const discordId = authUser?.user_metadata?.provider_id;

        if (!authUser || !discordId) {
            error(401, 'User not authenticated');
        }

        // get user's uuid from users table using discord_id
        const { data: user, error: supaError } = await supabasePrivateClient
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
        const { error: unsetError } = await supabasePrivateClient
            .from('addresses')
            .update({ is_primary: false })
            .eq('user_id', user.id);

        if (unsetError) {
            error(500, 'Failed to update wallet information');
        }

        // set the selected address as primary
        const { error: setPrimaryError } = await supabasePrivateClient
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
    disconnectWallet: async ({ request, params, cookies, locals }) => {
        const formData = await request.formData();
        const wallet = formData.get('wallet')?.toString();

        // verify the token
        const token = cookies.get(`avm-wallet-token-${wallet}`);
        const isValid = (wallet && token) ? await verifyToken(wallet, token) : false;

        if (!isValid) {
            error(401, 'Invalid wallet token');
        }

        // get user's discord ID
        const authUser = (await locals.getSession())?.user;
        const discordId = authUser?.user_metadata?.provider_id;

        if (!authUser || !discordId) {
            error(401, 'User not authenticated');
        }

        // get user's uuid from users table using discord_id
        const { data: user, error: supaError } = await supabasePrivateClient
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

        // disconnect the wallet by updating column `disconnected` to true
        const { error: disconnectError } = await supabasePrivateClient
            .from('addresses')
            .update({ disconnected: true })
            .eq('user_id', user.id)
            .eq('address', wallet);
            
        if (disconnectError) {
            error(500, 'Failed to disconnect wallet');
        }

        return {
            status: 200,
            body: { success: true },
        };
    },
    optin: async ({ request, params, cookies, locals }) => {
        const formData = await request.formData();
        const optin = formData.get('optin')?.toString();

        // get user's discord ID
        const authUser = (await locals.getSession())?.user;
        const discordId = authUser?.user_metadata?.provider_id;

        if (!authUser || !discordId) {
            error(401, 'User not authenticated');
        }

        // update user's record to opt-in
        const { error: optinError } = await supabasePrivateClient
            .from('users')
            .update({ email_consent: optin === 'optin' })
            .eq('discord_id', discordId);

        if (optinError) {
            error(500, 'Failed to opt-in user');
        }

        return {
            status: 200,
            body: { success: true },
        };
    }
}