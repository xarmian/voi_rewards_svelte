import type { PageLoad } from './$types';
import snapshotTSV from "./snapshot_noescrow.txt?raw";

interface Snapshot {
    account: string;
    userType: string;
    voiBalance: number;
    viaBalance: number;
}

export const load: PageLoad = async ({ url }) => {
    const wantsCsv = url.searchParams.get('csv') === 'true';
    
    if (!wantsCsv) {
        return { wantsCsv: false };
    }

    // Parse snapshot data
    const snapshot: Snapshot[] = snapshotTSV.split('\n').map((line: string) => {
        const [account, userType, voiBalance, viaBalance] = line.split('\t');
        return {
            account,
            userType,
            voiBalance: parseInt(voiBalance) / Math.pow(10, 6),
            viaBalance: parseInt(viaBalance) / Math.pow(10, 6)
        };
    });

    const total_testnet_tokens = snapshot.reduce((acc, curr) => 
        acc + curr.voiBalance + curr.viaBalance, 0);

    // Generate CSV content
    const csvRows = snapshot.map(entry => {
        const totalBalance = entry.voiBalance + entry.viaBalance;
        const airdrop = totalBalance / total_testnet_tokens * 150_000_000;
        return `${entry.account},${airdrop}`;
    });

    const csvContent = ['account,airdrop_amount', ...csvRows].join('\n');

    return {
        wantsCsv: true,
        csvContent
    };
};
