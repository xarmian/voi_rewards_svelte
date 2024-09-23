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
    mechaswap: number;
    row_number?: number;
    points? : number;
}

export interface VRPhase2 {
    id: bigint; // Primary key
    user_id: string | null; // UUID of the user (foreign key referencing users(id))
    address: string; // text
    quest_data: object | null; // jsonb
    airdrop_amount: number; // numeric
    points_tokens: number; // numeric
    discord_roles: string[]; // text[]
    discord_member: boolean; // boolean
    last_modified: string; // timestamp with time zone
    discord_linked: boolean; // boolean
    join_discord_server: string | null; // timestamp with time zone
    created_discord_account: string | null; // timestamp with time zone
    total_quest_points: number | null; // numeric
    blacklisted: boolean; // boolean
    row_number?: number;
}

export interface VrPhase2 {
        id: number; // bigint
        user_id?: string | null; // uuid
        address: string; // text
        quest_data?: object | null; // jsonb
        airdrop_amount: number; // numeric
        points_tokens: number; // numeric
        discord_roles: string[]; // text[]
        discord_member: boolean; // boolean
        last_modified: string; // timestamp with time zone
        discord_linked: boolean; // boolean
        join_discord_server: string | null; // timestamp with time zone
        created_discord_account: string | null; // timestamp with time zone
        total_quest_points: number | null; // numeric
        blacklisted: boolean; // boolean
}

export interface VrQuest {
    id: number; // bigint
    created_at: string; // timestamp with time zone
    title?: string | null; // text
    name?: string | null; // text
    description?: string | null; // text
    guide?: string | null; // text
    frequency?: string | null; // text
    reward?: number | null; // integer
    status?: string | null; // text
    project?: number | null; // bigint
}

export interface VrProject {
    id: number; // bigint
    created_at: string; // timestamp with time zone
    title?: string | null; // text
    type?: string | null; // text
    category?: string | null; // text
    column?: string | null; // text
    description?: string | null; // text
    logo?: string | null; // text
    guide?: string | null; // text
    twitter?: string | null; // text
    galxe?: string | null; // text
    status?: string | null; // text
    url?: string | null; // text
}
