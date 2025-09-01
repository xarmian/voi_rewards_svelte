import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_ANON_KEY, PUBLIC_MIMIR_URL } from '$env/static/public';

// MIMIR client (public anon)
const supabaseMimirClient = createClient(PUBLIC_MIMIR_URL!, PUBLIC_MIMIR_ANON_KEY!);

export const GET: RequestHandler = async ({ url }) => {
  try {
    const tokenId = url.searchParams.get('tokenId');
    const symbol = url.searchParams.get('symbol');

    if (!tokenId && !symbol) {
      return json({ error: 'tokenId or symbol is required' }, { status: 400 });
    }

    // Query arc200 contracts for metadata (imageUrl, symbol, decimals)
    let query = supabaseMimirClient
      .from('arc200_contracts')
      .select('contract_id, symbol, decimals, image_url')
      .limit(1);

    if (tokenId) {
      query = query.eq('contract_id', Number(tokenId));
    } else if (symbol) {
      // Case-insensitive match on symbol
      query = query.ilike('symbol', symbol);
    }

    const { data, error } = await query;
    if (error) {
      return json({ error: `Failed to fetch token info: ${error.message}` }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return json({ info: null });
    }

    const row = data[0];
    return json({
      info: {
        tokenId: row.contract_id,
        symbol: row.symbol,
        decimals: row.decimals,
        imageUrl: row.image_url || null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};

