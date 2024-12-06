<script lang="ts">
	import { LinkOutline } from 'flowbite-svelte-icons';
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
                text: 'Funk\'s Ultimate Node Controller (FUNC)',
                url: 'https://github.com/GalaxyPay/func',
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
            /*{
                text: 'VOI Node Metrics (Node Health Stats and History)',
                url: 'https://voi-nodes.dev/',
            },*/
            {
                text: 'Guide to Setting up a *Relay Node*',
                url: 'https://voinetwork.github.io/voi-swarm/advanced-node-running/relay-node/',
            },
            {
                text: 'VOI Node Running System Requirements (for Voi Swarm)',
                url: 'https://voinetwork.github.io/voi-swarm/installation/system-requirements/',
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
                url: 'https://discord.gg/voi-network',
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

<div class="bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-purple-900 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
        <header class="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-6 mb-8">
            <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white">Node Running Resources</h1>
            <p class="mt-2 text-xl text-gray-600 dark:text-gray-300">Interested in Running a Node? Check out the resources and links below</p>
            <p class="mt-4 text-gray-600 dark:text-gray-400">
                Node Runners earn block rewards for each block they propose. Block proposals are a key part of the Voi consensus mechanism.
            </p>
        </header>

        {#each categories as category}
            <section class="mb-8 bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden">
                <header class="bg-purple-600 dark:bg-purple-800 py-4 px-6">
                    <h2 class="text-2xl font-bold text-white">{category.heading}</h2>
                    {#if category.subheading}
                        <p class="text-purple-200 dark:text-purple-300 mt-1">{category.subheading}</p>
                    {/if}
                </header>
                <ul class="py-4">
                    {#each category.links as link}
                        <li class="px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition duration-150 ease-in-out">
                            <A href={link.url} target="_blank" class="flex items-center text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400">
                                <LinkOutline class="w-5 h-5 mr-3" />
                                <span>
                                    {#each link.text.split('*') as text, i}
                                        {#if i % 2 === 0}
                                            <span>{text}</span>
                                        {:else}
                                            <span class="font-semibold text-purple-600 dark:text-purple-400">{text}</span>
                                        {/if}
                                    {/each}
                                </span>
                            </A>
                        </li>
                    {/each}
                </ul>
            </section>
        {/each}
    </div>
</div>