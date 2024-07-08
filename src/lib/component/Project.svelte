<script lang="ts">
  import QuestCard from './QuestCard.svelte';

    import type { IProject, IQuest} from "$lib/data/types";
    import { supabasePublicClient } from '$lib/supabase';
	import { algodClient } from "$lib/utils/algod";
	import InfoButton from "./ui/InfoButton.svelte";
	import WalletSearch from './WalletSearch.svelte';

    interface Transfer {
        transactionId: string;
        contractId: number;
        tokenId: number;
        round: number;
        fromAddr: string;
        toAddr: string;
        timestamp: number;
    }

    interface TransferData {
        transfers: Transfer[];
    }

    interface WalletPoints {
        wallet: string;
        points: number;
    }

    export let project: IProject;
    export let wallet: string | null;
    export let searchWallet: string | undefined;

    let steps = [
        {
            name: 'Wallet Offline',
            detected: false,
            additionalInfo: ''
        },
        {
            name: 'Telemetry Not Detected',
            detected: false,
            additionalInfo: 'Ensure your node has at least 2000 VOI, telemetry is enabled',
            additionalInfo2: 'It may take a few hours for telemetry to be detected after starting your node.'
        },
        {
            name: 'Health Score >= 5.0',
            detected: false,
            additionalInfo: '',
            additionalInfo2: ''
        }
    ];

    $: localProject = project;
    $: loading = true;

    const displayBalance = (amt: number) => {
        return (amt / Math.pow(10,6)).toLocaleString();
    }

    async function getNodePoints() {
        try {
            if (wallet) {
                const url = `https://api.voirewards.com/proposers/index_p2.php?action=walletPoints&wallet=${wallet}`;
                const data = await fetch(url).then((response) => response.json());

                // data is an object of objects with key: date, { health, points }
                let points = Object.keys(data).map((key) => {
                    return { date: key, health: data[key].health, points: data[key].points, hours: data[key].hours, name: data[key].name };
                });
                
                // find the quest with name "run_a_node"
                let ni = localProject.quests.find((quest) => quest.name === 'run_a_node');
                if (ni) {
                    const filteredPoints = points.slice(0, -1); // Exclude the last record
                    ni.earned = filteredPoints.reduce((acc, cur) => acc + cur.points, 0);
                }

                const accountInfo = await algodClient.accountInformation(wallet).do();
                if (accountInfo.status === 'Offline') {
                    steps[0].detected = false;
                    steps[0].name = 'Wallet Offline';
                }
                else if (accountInfo.status === 'Online') {
                    steps[0].detected = true;
                    steps[0].name = 'Wallet Online';
                    steps[0].additionalInfo = `Online Balance: ${displayBalance(accountInfo.amount)} VOI`;
                }
                
                if (points && points.length > 0) {
                    if (points[points.length-1] && points[points.length-1].hours > 0) {
                        steps[1].detected = true;
                        steps[1].name = 'Telemetry Detected';
                        steps[1].additionalInfo = points[points.length-1].name;
                        steps[2].additionalInfo = `Current Weekly Health Score: ${points[points.length-1].health}`;
                    }

                    if (points[points.length-1].health >= 5.0) {
                        steps[2].detected = true;
                        steps[2].additionalInfo2 = 'Maintain health score above 5.0 to earn points at end of epoch (Sunday 23:59 UTC).'
                    }
                    else {
                        if (points[points.length-1].hours < 168) {
                            steps[2].additionalInfo2 = 'Health score is an average and may take up to a week to reach its full value.';
                        }
                        else {
                            steps[2].additionalInfo2 = 'Health score must be above 5.0 to earn points at end of epoch (Sunday 23:59 UTC).';
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
        loading = false;
    }

    async function getNomadexPoints() {
        try {
            const url = `https://api.nomadex.app/actions.csv?address=${wallet}`;
            const response = await fetch(url);
            const csvData = await response.text();
            const parsedData = parseCSV(csvData);
            
            // filter parsedData for wallet (address)
            const data = parsedData.filter((row) => row.address === wallet);
            
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                const row = data.filter((row) => row.action === quest.name);

                if (row.length > 0) {
                    if (quest.name == 'swap') {
                        let uniqueDates = new Set();
                        row.forEach(entry => {
                            let date = new Date(Number(entry.timestamp)).toISOString().split('T')[0];
                            uniqueDates.add(date);
                        });
                        quest.earned = uniqueDates.size;
                    }
                    else {
                        quest.earned = 1;
                    }
                }
                else {
                    quest.earned = 0;
                }
            }
            
            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getNFTNavigatorPoints() {
        const { data, error } = await supabasePublicClient
            .from('actions')
            .select('*')
            .eq('address', wallet);

        if (error) {
            console.error('Failed to fetch quests', error);
        }
        else {
            let completedActions = [...new Set(data.map(item => item.action))];

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (completedActions.includes(quest.name)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        }
    }

    async function getAlgoLeaguesPoints() {
        try {
            const url = `/api/quests/?project=Algoleagues&wallet=${wallet}`;
            const response = await fetch(url);
            const data = await response.json();

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data && data.quests && data.quests[`algo-leagues-${quest.id}`]?.completed) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getNautilusPoints() {
        try {
            const url = `https://quest.nautilus.sh/quest?key=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.message !== 'ok') {
                console.error('Failed to fetch Nautilus points:', data.message);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data.results.find((result: { key: string, value: string }) => result.key === quest.name+':'+wallet)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getMechaswapPoints() {
        try {
            const url = `https://mechaswap-quest.nautilus.sh/quest?key=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.message !== 'ok') {
                console.error('Failed to fetch Nautilus points:', data.message);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data.results.find((result: { key: string, value: string }) => result.key === quest.name+':'+wallet)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getHumblePoints() {
        try {
            const url = `https://humble-quest.nautilus.sh/quest?key=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.message !== 'ok') {
                console.error('Failed to fetch Nautilus points:', data.message);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (quest.name === undefined) {
                    quest.earned = -1;
                }
                else {
                    const rec = data.results.find((result: { key: string, value: string }) => result.key === quest.name+':'+wallet);
                    if (rec) {
                        if (rec.value > 1700000000000) {
                            quest.earned = 1;
                        }
                        else {
                            quest.earned = rec.value;
                        }
                    }
                    else {
                        quest.earned = 0;
                    }
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    async function getKibisisPoints() {
        try {
            const url = `https://api.kibis.is/v1/quests?account=${wallet}`;
            const data = await fetch(url).then((response) => response.json());

            if (data.account !== wallet) {
                console.error('Failed to fetch Kibisis points:', data);
                return;
            }

            // for each quest, check if action is in completedActions
            for (let i = 0; i < project.quests.length; i++) {
                const quest = project.quests[i];
                if (data.quests.find((result: { id: string, completed: number }) => result.id === quest.name && result.completed === 1)) {
                    quest.earned = 1;
                }
                else {
                    quest.earned = 0;
                }
            }

            loading = false;
        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    function calculateChubsHoldPoints(transferData: TransferData, wallet: string): WalletPoints | undefined {
        const walletHoldings: Map<string, Map<number, number>> = new Map();
        const walletEpochs: Map<string, Set<number>> = new Map();

        // Helper function to get the epoch number
        const getEpochNumber = (timestamp: number): number => {
            const date = new Date(timestamp * 1000);
            date.setUTCHours(0, 0, 0, 0);
            return Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
        };

        // last epoch is today
        const lastEpoch = getEpochNumber(Date.now() / 1000);

        // Process transfers
        transferData.transfers.forEach((transfer) => {
            const epochNumber = getEpochNumber(transfer.timestamp);

            // Remove token from sender's holdings
            if (transfer.fromAddr !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
                const senderHoldings = walletHoldings.get(transfer.fromAddr) || new Map();
                senderHoldings.delete(transfer.tokenId);
                walletHoldings.set(transfer.fromAddr, senderHoldings);
            }

            // Add token to receiver's holdings
            const receiverHoldings = walletHoldings.get(transfer.toAddr) || new Map();
            receiverHoldings.set(transfer.tokenId, epochNumber);
            walletHoldings.set(transfer.toAddr, receiverHoldings);
        });

        // Calculate points for each wallet
        walletHoldings.forEach((holdings, wallet) => {
            const epochs = new Set<number>();
            holdings.forEach((acquiredEpoch, tokenId) => {
                for (let epoch = acquiredEpoch; epoch <= lastEpoch; epoch++) {
                    epochs.add(epoch);
                }
            });
            walletEpochs.set(wallet, epochs);
        });

        // Convert to result format
        const result: WalletPoints[] = Array.from(walletEpochs.entries()).map(([wallet, epochs]) => ({
            wallet,
            points: Math.max(epochs.size-2,0)
        }));

        return result.find((walletPoints) => walletPoints.wallet === wallet);
    }

    function calculateShareChubsPoints(transferData: TransferData): WalletPoints[] {
        const walletWeeklyTransfers: Map<string, boolean> = new Map();

        // Helper function to get the week number
        const getWeekNumber = (timestamp: number): number => {
            const date = new Date(timestamp * 1000);
            date.setUTCHours(0, 0, 0, 0);
            date.setUTCDate(date.getUTCDate() - date.getUTCDay() + 1);
            return Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
        };

        // Process transfers
        transferData.transfers.forEach((transfer) => {
            const weekNumber = getWeekNumber(transfer.timestamp);

            // Only consider outgoing transfers (ignore minting address)
            if (transfer.fromAddr !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
                const key = `${transfer.fromAddr}-${weekNumber}`;
                walletWeeklyTransfers.set(key, true);
            }
        });

        // Calculate points
        const walletPoints: Map<string, number> = new Map();
        walletWeeklyTransfers.forEach((v, key) => {
            const [wallet, _] = key.split('-');
            walletPoints.set(wallet, (walletPoints.get(wallet) || 0) + 1);
        });

        // Convert to array of objects
        const result: WalletPoints[] = Array.from(walletPoints, ([wallet, points]) => ({ wallet, points }));
        return result;
    }

    async function getChubsPoints() {
        let url;
        let quest;

        try {
            if (wallet) {
                // grab_chub
                quest = project.quests[0];
                quest.earned = 0;
                url = `https://arc72-idx.nftnavigator.xyz/nft-indexer/v1/transfers?contractId=48716545&to=${wallet}&limit=1`;
                let data = await fetch(url).then((response) => response.json());
                if (data.transfers.length > 0) {
                    quest.earned = 1;
                }
                else {
                    url = `https://arc72-idx.nftnavigator.xyz/nft-indexer/v1/mp/sales?collectionId=48716545&buyer=${wallet}&limit=1`;
                    data = await fetch(url).then((response) => response.json());
                    if (data.sales.length > 0) {
                        quest.earned = 1;
                    }
                }

                // share_chub
                quest = project.quests[1];
                quest.earned = 0;
                url = `https://arc72-idx.nftnavigator.xyz/nft-indexer/v1/transfers?contractId=48716545&from=${wallet}`;
                data = await fetch(url).then((response) => response.json())
                const spts = calculateShareChubsPoints(data);
                if (spts.length > 0) {
                    quest.earned = spts[0].points;
                }

                // hold_chub
                quest = project.quests[2];
                quest.earned = 0;
                url = `https://arc72-idx.nftnavigator.xyz/nft-indexer/v1/transfers?contractId=48716545&user=${wallet}`;
                data = await fetch(url).then((response) => response.json());
                const r = calculateChubsHoldPoints(data, wallet);
                if (r) {
                    quest.earned = r.points;
                }
            }

           loading = false;
        }
        catch (error) {
            console.error('Failed to fetch Chubs points:', error);
        }
    }

    $: if (wallet) {
        loading = true;
        switch(project.title) {
            case 'Voi Network':
                getNodePoints();
                break;
            case 'Nomadex':
                getNomadexPoints();
                break;
            case 'NFT Navigator':
                getNFTNavigatorPoints();
                break;
            case 'Kibisis':
                getKibisisPoints();
                break;
            case 'AlgoLeagues':
                getAlgoLeaguesPoints();
                break;
            case 'Nautilus':
                getNautilusPoints();
                break;
            case 'MechaSwap':
                getMechaswapPoints();
                break;
            case 'Humble':
                getHumblePoints();
                break;
            case 'Chubs':
                getChubsPoints();
                break;
            default:
                for (let i = 0; i < project.quests.length; i++) {
                    project.quests[i].earned = -1;
                }
                loading = false;
                break;
        }
    }

    function parseCSV(csvData: string): Array<Record<string, string>> {
        const lines = csvData.split('\n');
        const result: Array<Record<string, string>> = [];
        const headers = lines[0].split(',');

        for (let i = 1; i < lines.length; i++) {
            const obj: Record<string, string> = {};
            const currentline = lines[i].split(',');

            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = currentline[j];
            }

            result.push(obj);
        }

        return result;
    }

</script>
<div class="dark:text-white p-8 sm:rounded-lg my-4">
    <h2 class="text-3xl font-bold">
        {#if project.logo && project.url}
            <a target="_blank" href={project.url}>
                <img class="h-24 rounded-lg" src={project.logo} alt={project.title} />
            </a>
        {:else if project.url}
            <a class="text-blue-900 hover:text-blue-700 underline cursor-pointer" target="_blank" href={project.url}>
                {project.title}
            </a>
        {:else}
            {project.title}
        {/if}
    </h2>
    <div class="flex flex-col md:flex-row md:items-center space-x-4">
        <div class="mb-4 md:mb-0 w-2/5 self-start">
            <p class="text-gray-800 dark:text-gray-200 text-lg">{project.description}</p>
            {#if !project.realtime}
                <div class="text-xs text-red-800">Live quest tracking is not yet available for this project.</div>
            {/if}
        </div>
        <div class="flex flex-col space-y-2 w-full self-end">
            {#if project.guide}
                <a href={project.guide} target="_blank" class="flex h-14 w-full bg-white text-[#41137E] dark:bg-gray-700 dark:text-[#D4BFF6] rounded-md font-bold px-4 py-2 items-center space-x-2 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-300 dark:hover:border-gray-500">
                <div class="rounded-full bg-[#D4BFF6] h-6 w-6 flex items-center justify-center">
                    <i class="fa-regular fa-comment text-[#41137E] text-xs"></i>
                </div>
                  <div>{project.title} Quest Guide</div>
                  <i class="fas fa-arrow-right flex-grow text-end"></i>
               </a>
            {/if}
            {#if project.twitter}
                <a href={project.twitter} target="_blank" class="flex h-14 w-full bg-white text-[#41137E] dark:bg-gray-700 dark:text-[#D4BFF6] rounded-md font-bold px-4 py-2 items-center space-x-2 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-300 dark:hover:border-gray-500">
                <div class="rounded-full bg-[#D4BFF6] h-6 w-6 flex items-center justify-center">
                    <i class="fa-brands fa-x-twitter text-[#41137E] text-xs"></i>
                </div> 
                <div>{project.title} Twitter/X</div>
                <i class="fas fa-arrow-right flex-grow text-end"></i>
                </a>
            {/if}
        </div>
    </div>
</div>
<div class="rounded-lg bg-white dark:bg-opacity-70 text-[#41137E] font-extrabold text-lg flex flex-col sm:flex-row justify-center mx-8 p-4 space-x-4 items-center">
    <p class="text-center">Enter a wallet address to see your Voi TestNet Phase #2 Quest Progress</p>
    <div class="text-center sm:w-1/2 text-gray-200">
        <WalletSearch bind:searchText={searchWallet} storeAddress={true} onSubmit={(addr) => { wallet = addr; } } loadPreviousValue={true} />
    </div>
</div>
<div class="flex flex-col justify-center text-[#41137E]">
    <div class="flex flex-wrap justify-around p-4">
        {#each localProject.quests as quest, i}
            <div class="{quest.name != 'run_a_node' ? 'w-full sm:w-1/2 md:w-1/3' : ''} bg-[#F2EAFF] dark:bg-opacity-80 rounded-lg overflow-hidden m-2 p-8 flex flex-col justify-between">
                <div class="">
                    <div class="font-extrabold text-2xl mb-2">{quest.title}</div>
                    {#if quest.title !== quest.description}
                        <p class="text-base">{quest.description}</p>
                    {/if}
                </div>
                {#if quest.name != 'run_a_node'}
                    <QuestCard {project} {quest} {wallet} {loading}></QuestCard>                
                {:else}
                    <div class="m-8 w-1/2 place-self-center">
                        {#if quest.guide}
                            <a class="flex justify-between rounded-lg text-white px-4 py-3 bg-[#6F2AE2] text-xl place-items-center" target="_blank" href={quest.guide}>
                                <div>View Guide</div>
                                <i class="fas fa-arrow-right"></i>
                            </a>
                        {/if}
                    </div>
                    {#if !loading}
                        <div class="flex flex-col items-center m-2 mt-4">
                            <ul>
                            {#each steps as {name, detected, additionalInfo, additionalInfo2}}
                                <li class="flex items-start mb-4">
                                {#if detected}
                                    <span class="text-green-500 mb-2 mr-2">&#10003;</span>
                                {:else}
                                    <span class="text-red-500 mb-2 mr-2">&#10007;</span>
                                {/if}
                                <div class="flex flex-col">
                                    <div>{name}</div>
                                    <div class="text-sm">{additionalInfo}</div>
                                    {#if additionalInfo2}
                                        <div class="text-sm">{additionalInfo2}</div>
                                    {/if}
                                </div>
                                </li>
                            {/each}
                            </ul>
                        </div>
                    {/if}
                    <div class="px-6 pt-1 pb-2 flex flex-row items-center justify-center space-x-4">
                        {#if !project.realtime || quest.earned == -1 || !quest.name}
                            <div class="text-xs text-red-500 flex flex-row">
                                Status unavailable
                                <InfoButton noAbsolute={true}>
                                    <p class="text-xs">We are currently unable to track the completion status for this quest. Quests or actions listed should still be tracked if done properly, and may be visible on other platforms such as Galxe, on the Project's own page, or not available yet. A link to the project's Galaxe page is available above this quest table.</p>
                                </InfoButton>
                            </div>
                        {:else if !wallet}
                            <div class="text-xs text-red-500">Enter Wallet to View Status</div>
                        {:else if loading}
                            <i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i>
                        {:else if quest.earned}
                            <div class="text-sm text-green-800">
                                <div>Weeks earned so far: {quest.earned}</div>
                                <div class="text-xs">(Not including current week)</div>
                            </div>
                        {/if}
                    </div>
                    <div class="p-4">
                        NOTICE: If multiple wallets are staked to the same node, the points will be divided among the wallets.
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</div>
