<script lang="ts">
	import { TwitterSolid, DiscordSolid, GlobeOutline, LinkSolid, LinkOutline } from 'flowbite-svelte-icons';
    import { A } from 'flowbite-svelte';
    import faucetImg from '$lib/assets/voi-testnet-faucet.png';

    let categories = [{
        heading: 'Participation Node Setup Guides',
        links: [
            {
                text: 'Official VOI *Technical Documentation*',
                url: 'https://docs.voi.network/',
            },
            {
                text: 'Guide to Setting up a *Participation Node* on Ubuntu by D13',
                url: 'https://d13.co/posts/set-up-voi-participation-node/',
            },
            {
                text: 'Guide to Setting up an *Aust One-Click Node* on Windows',
                url: 'https://github.com/AustP/austs-one-click-node',
            },
            {
                text: 'Guide to Setting up a Participation Node on *Docker*',
                url: 'https://github.com/xarmian/voinode',
            },
            {
                text: 'Guide to Setting up a Participation Node on *DappNode*',
                url: 'https://github.com/scholtz/dappnode-participation-node-voitest/blob/main/README.md',
            }
        ]
    },
    {
        heading: 'Additional Resources and Guides',
        links: [
            {
                text: 'VOI Node Metrics (Node Health Stats and History)',
                url: 'https://voi-nodes.dev/',
            },
            {
                text: 'Guide to Setting up a *Relay Node*',
                url: 'https://github.com/scholtz/dappnode-participation-node-voitest/blob/main/README.md',
            },
            {
                text: 'VOI Node Running Guides, Details, and Specifications Document',
                url: 'https://docs.google.com/document/d/16n0yEivEUjFtSypiZ4TRaZQmRi_emMtFPrgAarsSNSE/edit#heading=h.fx33lxdr6ymi',
            },
        ]
    },
    {
        heading: 'Need Help?',
        subheading: 'More Links and Resources',
        links: [
            {
                text: 'VOI Website',
                url: 'https://voi.network',
            },
            {
                text: 'VOI Discord',
                url: 'htps://discord.gg/voinetwork',
            },
            {
                text: '@Voi_Net Twitter',
                url: 'https://twitter.com/Voi_Net',
            },
            {
                text: 'Voi Subreddit',
                url: 'https://www.reddit.com/r/Voi_Net/',
            }
        ]
    }];
    
</script>

<div class="about">
    <header class="bg-gray-100 dark:bg-gray-800 py-4 px-8">
        <h1 class="text-2xl font-bold">Node Running Resources</h1>
        <h2 class="text-lg font-medium text-gray-600">Interested in Running a Node? Check out the resources and links below:</h2>
    </header>
    <div class="m-10">
        Node Runners earn rewards based on the number of blocks they produce and the health of their node.
        <A href="https://docs.google.com/document/d/1tgU9Ytd4YxHGOsnFBIuEV75sclpI92AeYPxVZcBxvE0" target="_blank">See this approved proposal</A> for more specific details on how node runners are rewarded.
        Rewards are distributed each Monday based on the previous week's Health score and block proposal count.
    </div>
    <ul class="m-10">
        <header class="bg-gray-50 dark:bg-gray-700 py-4 px-8">
            <h1 class="text-xl font-bold">Quick Start Guide</h1>
        </header>
        <li class='ml-10 m-2'>
            1. Set up a Node using one of the <b>Participation Node Setup Guides</b> below.
        </li>
        <li class='ml-10 m-2'>
            2. Go to the <A href="htps://discord.gg/voinetwork" target="_blank">VOI Discord</A>, and request the <b>Node Runner</b> role in the <A href="https://discord.com/channels/1055863853633785857/1157678590196973728" target="_blank">#rules-and-roles</A> channel.
        </li>
        <li class='ml-10 m-2'>
            3. Go to the <A href="https://discord.com/channels/1055863853633785857/1128672413048115250" target="_blank">#node-runner-help</A> channel and start to type <b>/voi-testnet-faucet</b> until you see this:
            <img src="{faucetImg}" style='max-height:200px;'/>
        </li>
        <li class='ml-10 m-2'>
            4. Click <b>/voi-testnet-faucet</b> and paste your wallet address directly after it, like this: <span class='faucet-text'>/voi-testnet-faucet YOUR_WALLET_ADDRESS</span> and hit Enter to receive one VOI token.
        </li>
        <li class='ml-10 m-2'>
            5. Bring your wallet "online" as explained in the Guide you used to set up your node. 
        </li>
        <li class='ml-10 m-2'>
            6. Once your wallet is online, <b>repeat step 3 and 4</b> to receive a "top-up" of additional VOI tokens. These extra tokens will help "seed" your node with tokens to begin voting in consensus, which allows metrics to be captured to calculate your Health Score.
        </li>
        <li class='ml-10 m-2'>
            7. Wait a few hours for your node to appear on the <A href="https://voi-node-info.boeieruurd.com/">Voi-Node Metrics Dashboard</A>, then periodically monitor your node's health. On the Monday following a Healthy <b>weekly</b> score of 5.0 or higher, you will receive your first Health rewards directly to your wallet.
        </li>
        <li class='ml-10 m-2'>
            8. After receiving your first Health rewards, your node should begin producing blocks. No additional steps are needed to increase your "stake". Each following week you should be eligible to receive both Health and Block rewards.
        </li>
        <li class='ml-10 m-2'>
            <b>NOTE:</b> All Healthy Nodes receive an equal share of the <i>Health Rewards</i> each week. <i>Block Rewards</i> are based on blocks produced by your node as a fraction of the total eligible blocks produced during the week.
            Visit the <A href='/'>Home</A> page to see an estimate of rewards expected for your wallet based on each week's metrics.
        </li>
    </ul>
    {#each categories as category}
        <ul class="m-10">
            <header class="bg-gray-50 dark:bg-gray-700 py-4 px-8">
                <h1 class="text-xl font-bold">{category.heading}</h1>
                {#if category.subheading}
                    <h2 class="text-lg font-medium text-gray-600">{category.subheading}</h2>
                {/if}
            </header>
            {#each category.links as link}
                <li class='ml-10'>
                    <A href={link.url} target="_blank">
                        <LinkOutline class="inline" />
                        <span class='m-2'>
                            {#each link.text.split('*') as text, i}
                                {#if i % 2 === 0}
                                    <span> {text} </span>
                                {:else}
                                    <span class="font-bold"> {text} </span>
                                {/if}
                            {/each}
                        </span>
                    </A>
                </li>
            {/each}
        </ul>
    {/each}
</div>

<style>
    .faucet-text {
        background-color: #f7fafc;
        border-radius: 0.25rem;
        color: #4a5568;
        display: inline-block;
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1.25rem;
        padding: 0.25rem 0.5rem;
    }
</style>