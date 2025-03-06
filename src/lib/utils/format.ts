export function formatNumber(num: number): string {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    }).format(num / 1_000_000); // Convert from microVOI to VOI
}

export function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    }).format(date);
}

export function formatDuration(seconds: number): string {
    const ms = seconds * 1000;
    const months = Math.round(ms / (30.44 * 24 * 60 * 60 * 1000));
    return `${months} ${months === 1 ? 'month' : 'months'}`;
}

export function truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Convert from atomic units (microVOI) to normalized units (VOI)
export function microVOIToVOI(microVOI: number): number {
    return microVOI / 1_000_000;
}

// Convert from normalized units (VOI) to atomic units (microVOI)
export function VOIToMicroVOI(voi: number): number {
    return Math.floor(voi * 1_000_000);
} 