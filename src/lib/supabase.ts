// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseAnonKey = PUBLIC_SUPABASE_ANON_KEY;

export const supabasePublicClient = createClient(supabaseUrl!, supabaseAnonKey!);

export interface PLeaderboard {
    wallet: string;
    last_modified: Date;
    total: number;
    network: number;
    nftnavigator: number;
    nautilus: number;
    humble: number;
    kibisis: number;
    nomadex: number;
    highforge: number;
    algoleagues: number;
}
