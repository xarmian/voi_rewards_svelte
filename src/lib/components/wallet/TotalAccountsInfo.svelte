<script lang="ts">
    export let accounts: Array<{
        isParticipating: boolean;
        balance: number;
        blocksProduced24h: number;
        expectedBlocks24h: number;
        expectedTokensPerDay: number;
        expectedTokensPerWeek: number;
        expectedTokensPerMonth: number;
    }>;

    $: totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
    $: totalBlocksProduced24h = accounts.reduce((sum, account) => sum + account.blocksProduced24h, 0);
    $: totalExpectedBlocks24h = accounts.reduce((sum, account) => sum + account.expectedBlocks24h, 0);
    $: totalExpectedTokensPerDay = accounts.reduce((sum, account) => sum + account.expectedTokensPerDay, 0);
    $: totalExpectedTokensPerWeek = accounts.reduce((sum, account) => sum + account.expectedTokensPerWeek, 0);
    $: totalExpectedTokensPerMonth = accounts.reduce((sum, account) => sum + account.expectedTokensPerMonth, 0);
    $: participatingAccounts = accounts.filter(account => account.isParticipating).length;
</script>

<div class="overflow-x-auto">
    <table class="min-w-full bg-white">
        <tbody>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Total Accounts</td>
                <td class="py-2 px-4 border-b">{accounts.length}</td>
            </tr>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Participating Accounts</td>
                <td class="py-2 px-4 border-b">{participatingAccounts}</td>
            </tr>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Total Balance</td>
                <td class="py-2 px-4 border-b">{totalBalance.toLocaleString()} VOI</td>
            </tr>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Total Blocks Produced (24h)</td>
                <td class="py-2 px-4 border-b">{totalBlocksProduced24h}</td>
            </tr>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Total Expected Blocks (24h)</td>
                <td class="py-2 px-4 border-b">{totalExpectedBlocks24h}</td>
            </tr>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Total Expected Tokens (Day)</td>
                <td class="py-2 px-4 border-b">{totalExpectedTokensPerDay.toLocaleString()} VOI</td>
            </tr>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Total Expected Tokens (Week)</td>
                <td class="py-2 px-4 border-b">{totalExpectedTokensPerWeek.toLocaleString()} VOI</td>
            </tr>
            <tr>
                <td class="py-2 px-4 border-b font-semibold">Total Expected Tokens (Month)</td>
                <td class="py-2 px-4 border-b">{totalExpectedTokensPerMonth.toLocaleString()} VOI</td>
            </tr>
        </tbody>
    </table>
</div>
