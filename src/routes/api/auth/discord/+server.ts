import type { RequestHandler } from '@sveltejs/kit';
import { supabasePrivateClient as supabase } from '$lib/supabase-server';
import { PRIVATE_RECAPTCHA_SECRET_KEY } from '$env/static/private';
import crypto from 'crypto';

async function verifyRecaptcha(token: string) {
    const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${PRIVATE_RECAPTCHA_SECRET_KEY}&response=${token}`
    });

    const recaptchaResult = await recaptchaResponse.json();
    return recaptchaResult.success;
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { access_token, recaptcha_token: recaptchaToken } = await request.json();

        if (!recaptchaToken) {
            return new Response(JSON.stringify({ error: 'reCAPTCHA token is missing' }), { status: 400 });
        }

        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);

        if (!isRecaptchaValid) {
            return new Response(JSON.stringify({ error: 'reCAPTCHA verification failed' }), { status: 400 });
        }

        // Fetch Discord user information
        const discordResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        if (!discordResponse.ok) {
            return new Response(JSON.stringify({ error: 'Failed to fetch Discord information' }), {
                status: 400,
            });
        }

        const discordUser = await discordResponse.json();

        // Capture user's IP address
        const clientIp = request.headers.get('cf-connecting-ip') || 
                         request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                         request.headers.get('x-real-ip') || 
                         'Unknown';
                         
        // generate hash of ip address
        const ipHash = clientIp !== 'Unknown' 
            ? crypto.createHash('sha256').update(clientIp).digest('hex')
            : 'Unknown';

        if (clientIp === 'Unknown') {
            console.warn('Unable to determine client IP address');
        }

        // Check if the user already exists
        const { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('discord_id')
            .eq('discord_id', discordUser.id)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error fetching user:', fetchError);
            return new Response(JSON.stringify({ error: 'Failed to check existing user' }), {
                status: 500,
            });
        }

        interface UpsertDataObject {
            discord_id: string;
            username: string;
            email: string;
            user_ip?: string;
        }

        // Prepare upsert data
        const upsertData: UpsertDataObject = {
            discord_id: discordUser.id,
            username: discordUser.username,
            email: discordUser.email,
        };

        // Only include user_ip if it's a new record
        if (!existingUser) {
            upsertData.user_ip = ipHash;
        }

        // Log user information to supabase
        const { error } = await supabase
            .from('users')
            .upsert(upsertData, {
                onConflict: 'discord_id',
            });
        if (error) {
            console.error('Error logging Discord information:', error);
            return new Response(JSON.stringify({ error: 'Failed to log Discord information' }), {
                status: 500,
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
        });
    } catch (err) {
        console.error('Error processing request:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
        });
    }
};