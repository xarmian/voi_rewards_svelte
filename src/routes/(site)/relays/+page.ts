import { supabasePublicClient } from '$lib/supabase';
import type { PageLoad } from './$types';

interface WeekRange {
    start: string;
    end: string;
    label: string;
}

function createDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return date;
}

function formatDateForLabel(date: Date): string {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC'
    });
}

function generateWeekRanges(startDate: string, endDate: string): WeekRange[] {
    const weeks: WeekRange[] = [];
    const end = createDate(endDate);

    // Add the first week (Sept 18 - Sept 24)
    weeks.push({
        start: '2024-09-18',
        end: '2024-09-24',
        label: `09/18/2024 - 09/24/2024`
    });

    // Start from the next week
    let currentStart = createDate('2024-09-25'); // Start of second week
    
    while (currentStart <= end) {
        const weekEnd = new Date(currentStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // 6 days after start
        
        weeks.push({
            start: currentStart.toISOString().split('T')[0],
            end: weekEnd.toISOString().split('T')[0],
            label: `${formatDateForLabel(currentStart)} - ${formatDateForLabel(weekEnd)}`
        });
        
        currentStart = new Date(weekEnd);
        currentStart.setDate(currentStart.getDate() + 1); // Move to next week's start
    }
    
    return weeks;
}

export const load: PageLoad = async () => {
    // Get the max date from the database
    const { data: maxDateResult, error: maxDateError } = await supabasePublicClient
        .from('vr_relay_peers')
        .select('peer_date')
        .order('peer_date', { ascending: false })
        .limit(1)
        .single();

    if (maxDateError) {
        throw new Error('Failed to fetch max date');
    }

    const startDate = '2024-10-30';
    const endDate = maxDateResult.peer_date;
    const weeks = generateWeekRanges(startDate, endDate);

    return {
        weeks,
        defaultWeek: weeks[weeks.length - 1] // Most recent week
    };
}; 