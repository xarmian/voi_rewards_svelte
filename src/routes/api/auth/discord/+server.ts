import type { RequestHandler } from '@sveltejs/kit';
import { supabasePrivateClient as supabase } from '$lib/supabase-server';
import { PRIVATE_RECAPTCHA_SECRET_KEY } from '$env/static/private';

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
        const forwardedFor = request.headers.get('x-forwarded-for');
        const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip');

        if (!clientIp) {
            console.warn('Unable to determine client IP address');
        }

        // Log Discord information to your database
        const { error } = await supabase
            .from('users')
            .upsert({
                discord_id: discordUser.id,
                username: discordUser.username,
                email: discordUser.email,
                user_ip: clientIp,
            }, {
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