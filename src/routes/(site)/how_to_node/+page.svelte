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
                text: 'Guide to running a node with *Voi Swarm* (Linux)',
                url: 'https://voinetwork.github.io/voi-swarm',
            },
            {
                text: 'Video Guide to installing and managing a node with *PixelNode*',
                url: 'https://www.youtube.com/watch?v=BbuViDosZbE',
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
    <div class="ml-10">
        In Phase 2 of TestNet, Node Runners earn quest points for each week their node remains healthy.
    </div>
    <ul class="m-10">
        <header class="bg-gray-50 dark:bg-gray-700 py-4 px-8">
            <h1 class="text-xl font-bold">Quick Start Guide</h1>
        </header>
        <li class='ml-10 m-2'>
            1. Set up a Node using one of the <b>Participation Node Setup Guides</b> below.
        </li>
        <li class='ml-10 m-2'>
            2. Go to the <b>Voi Faucet</b> located here: <A href="https://voiager.org/get-started" target="_blank">Voi Faucet</A> and follow the instructions to receive TestNet Voi.
        </li>
        <li class='ml-10 m-2'>
            3. Bring your wallet "online" as explained in the Guide you used to set up your node. 
        </li>
        <li class='ml-10 m-2'>
            4. Wait a few hours for your node to appear on the <A href="https://voi-nodes.dev/">Voi-Node Metrics Dashboard</A>, then periodically monitor your node's health. On the Monday following a Healthy <b>weekly</b> score of 5.0 or higher, you will be awarded quest points, which can be seen in the <A href="/phase2">Voi Rewards Quest Tracker</A>.
        </li>
        <li class='ml-10 m-2'>
            <b>NEED HELP?</b> If you have any questions or need help, visit the <A href="htps://discord.gg/voinetwork" target="_blank">Voi Discord</A> for assistance.
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