import type { RequestHandler } from '@sveltejs/kit';
import { supabasePrivateClient as supabase } from '$lib/supabase-server';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { access_token } = await request.json();
    console.log('access_token:', access_token);

    // Fetch Discord user information
    const discordResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    console.log(discordResponse);

    if (!discordResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch Discord information' }), {
        status: 400,
      });
    }

    const discordUser = await discordResponse.json();
    console.log('discordUser:', discordUser);

    // Log Discord information to your database
    const { error } = await supabase
      .from('users')
      .upsert({
        discord_id: discordUser.id,
        username: discordUser.username,
        email: discordUser.email,
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