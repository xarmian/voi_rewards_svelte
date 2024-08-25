import type { RequestHandler } from '@sveltejs/kit';
import { supabasePrivateClient as supabasePrivateClient } from '$lib/supabase-server';
import { verifyToken } from 'avm-wallet-svelte';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
    const body = await request.json();
    const wallet = body.wallet;
    const walletId = wallet?.address;

    const token = cookies.get(`avm-wallet-token-${walletId}`);
    const isValid = (walletId && token) ? await verifyToken(walletId,token) : false;

    if (!isValid) {
        return new Response(JSON.stringify({ error: 'Invalid wallet token. Please re-authenticate your Voi Account and try again.' }), {
            status: 401,
        });
    }

    // get user's discord ID
    const authUser = (await locals.getUser());
    const discordId = authUser?.user_metadata?.provider_id;

    // get user's uuid from users table using discord_id
    const { data: user, error } = await supabasePrivateClient
        .from('users')
        .select('id')
        .eq('discord_id', discordId)
        .single();

    if (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch user information' }), {
            status: 500,
        });
    }

    if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
        });
    }

    // check if user already has a wallet, if not then this will be their primary wallet
    const { data: existingWallets, error: existingWalletsError } = await supabasePrivateClient
        .from('addresses')
        .select('id')
        .eq('user_id', user.id);

    if (existingWalletsError) {
        return new Response(JSON.stringify({ error: 'Failed to fetch wallet information' }), {
            status: 500,
        });
    }

    // Log wallet information to your database
    const { error: walletError } = await supabasePrivateClient
        .from('addresses')
        .upsert({
            user_id: user.id,
            address: walletId,
            chain: 'VOI',
            is_primary: !existingWallets || existingWallets.length === 0,
        }, {
            onConflict: 'user_id,address,chain',
        });
    
    if (walletError) {
        console.error('Error logging wallet information:', walletError);
        return new Response(JSON.stringify({ error: 'Failed to log wallet information' }), {
            status: 500,
        });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
    });
}