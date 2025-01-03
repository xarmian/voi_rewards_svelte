import { json } from '@sveltejs/kit';
import { supabasePublicClient } from '$lib/supabase';
import type { PeerRecord } from '$lib/types';
import { getTokensByEpoch } from '$lib/utils';
import { getCurrentEpoch } from '$lib/utils/epoch-utils';
import type { RequestEvent } from './$types';

function isValidDateString(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime());
}

export async function GET({ url }: RequestEvent) {
    try {
        let startStr: string;
        let endStr: string;

        const fromParam = url.searchParams.get('from');
        const toParam = url.searchParams.get('to');

        // Validate date parameters if provided
        if (fromParam && toParam) {
            if (!isValidDateString(fromParam) || !isValidDateString(toParam)) {
                return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
            }
            startStr = fromParam;
            endStr = toParam;
        } else if (fromParam || toParam) {
            return json({ error: 'Both from and to parameters must be provided together' }, { status: 400 });
        } else {
            // Calculate the date range for the previous Wed-Tue week using UTC
            const now = new Date();
            const utcNow = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                now.getUTCHours(),
                now.getUTCMinutes(),
                now.getUTCSeconds()
            ));
            
            const dayOfWeek = utcNow.getUTCDay(); // 0 = Sunday, 3 = Wednesday
            
            // Calculate days to go back to the most recent Wednesday
            let daysToWednesday = ((dayOfWeek - 3) + 7) % 7;
            if (daysToWednesday === 0 && utcNow.getUTCHours() < 23) {
                daysToWednesday = 7; // If it's Wednesday but before end of day, use previous Wednesday
            }
            
            // Get the most recent Wednesday
            const mostRecentWed = new Date(utcNow);
            mostRecentWed.setUTCDate(utcNow.getUTCDate() - daysToWednesday);
            
            // Get the start date (previous Wednesday)
            const start = new Date(mostRecentWed);
            start.setUTCDate(mostRecentWed.getUTCDate() - 7);
            start.setUTCHours(0, 0, 0, 0);
            
            // Get the end date (Tuesday)
            const end = new Date(start);
            end.setUTCDate(start.getUTCDate() + 6);
            end.setUTCHours(23, 59, 59, 999);

            startStr = start.toISOString().split('T')[0];
            endStr = end.toISOString().split('T')[0];
        }

        // Fetch peer data for the week
        const { data: rawData, error: queryError } = await supabasePublicClient
            .from('vr_relay_peers')
            .select('*')
            .gte('peer_date', startStr)
            .lte('peer_date', endStr)
            .order('host_name')
            .returns<PeerRecord[]>();

        if (queryError) throw queryError;

        // Get wallet mappings
        const { data: walletMappings, error: mappingError } = await supabasePublicClient
            .from('vr_relay_wallets')
            .select('host_prefix, wallet_address');

        if (mappingError) throw mappingError;

        // Create wallet mapping lookup
        const walletMap = new Map(
            walletMappings?.map(m => [m.host_prefix, m.wallet_address]) || []
        );

        // Calculate total peers for percentage calculation
        let totalPeersAllHosts = 0;
        const hostPeers = new Map<string, number>();

        // First pass: calculate total peers per host
        rawData.forEach(row => {
            const current = hostPeers.get(row.host_name) || 0;
            const newTotal = current + row.peer_count;
            hostPeers.set(row.host_name, newTotal);
            totalPeersAllHosts += row.peer_count;
        });

        // Calculate which epoch this week represents
        const epochStartDate = new Date('2024-10-30');
        const epochNumber = getCurrentEpoch(new Date(startStr), epochStartDate) + 1;
        
        // Get reward pool for this epoch
        const rewardPool = await getTokensByEpoch(epochNumber) / 10;

        // Aggregate rewards by account
        const accountRewards = new Map<string, {
            identifier: string;
            reward: number;
        }>();

        // Calculate rewards
        hostPeers.forEach((totalPeers, hostName) => {
            const percentage = (totalPeers / totalPeersAllHosts) * 100;
            const reward = (percentage / 100) * rewardPool;
            
            const hostPrefix = hostName.split('-')[0];
            const identifier = walletMap.get(hostPrefix) || hostPrefix;
            
            const current = accountRewards.get(identifier) || { identifier, reward: 0 };
            current.reward += reward;
            accountRewards.set(identifier, current);
        });

        // Generate CSV content
        const csvRows = ['account,userType,tokenAmount'];
        accountRewards.forEach(({ identifier, reward }) => {
            csvRows.push(`${identifier},relay,${Math.round(reward * Math.pow(10, 6))}`);
        });

        const csvContent = csvRows.join('\n');

        return new Response(csvContent, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="relay-rewards-${startStr}-${endStr}.csv"`
            }
        });

    } catch (error) {
        console.error('Error generating relay rewards CSV:', error);
        return json({ error: 'Failed to generate relay rewards CSV' }, { status: 500 });
    }
}
