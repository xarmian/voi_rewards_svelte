<script lang="ts">
	import { TwitterSolid, DiscordSolid, GlobeOutline, LinkSolid, LinkOutline } from 'flowbite-svelte-icons';
    import { A } from 'flowbite-svelte';

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
                url: 'https://voi-node-info.boeieruurd.com/',
            },
            {
                text: 'Guide to Setting up a *Relay Node*',
                url: 'https://github.com/scholtz/dappnode-participation-node-voitest/blob/main/README.md',
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
                url: 'https://t.co/mXYdYkWE6i',
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
    </div>
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
