<script lang="ts">
	import { TwitterSolid, DiscordSolid, GlobeOutline, LinkSolid, LinkOutline } from 'flowbite-svelte-icons';
    import { A } from 'flowbite-svelte';
</script>

<div class="about">
    <header class="bg-gray-100 py-4 px-8">
        <h1 class="text-2xl font-bold">Node Running Resources</h1>
        <h2 class="text-lg font-medium text-gray-600">Interested in Running a Node? Check out the resources and links below:</h2>
    </header>
    <div class="m-10">
        Node Runners earn rewards based on the number of blocks they produce and the health of their node.
        <A href="https://docs.google.com/document/d/1tgU9Ytd4YxHGOsnFBIuEV75sclpI92AeYPxVZcBxvE0" target="_blank">See this proposal</A> for more specific details on how node runners are rewarded.
    </div>
    <ul class="m-10">
        <header class="bg-gray-50 py-4 px-8">
            <h1 class="text-xl font-bold">Participation Node Setup Guides</h1>
        </header>
        <li>
            <A href="https://docs.voi.network/" target="_blank">
                <LinkOutline class="inline" />
                <span class="m-2">Official VOI Technical Documentation</span>
            </A>
        </li>
        <li>
			<A href="https://d13.co/posts/set-up-voi-participation-node/" target="_blank">
                <LinkOutline class="inline" />
                <span class="m-2">Guide to Setting up a <b>Paricipation Node</b> on Ubuntu</span>
            </A>
		</li>
        <li>
			<A href="https://github.com/AustP/austs-one-click-node" target="_blank">
                <LinkOutline class="inline" />
                <span class="m-2">Guide to Setting up an <b>Aust One-Click Node</b> on Windows</span>
            </A>
		</li>
		<li>
            <A href="https://github.com/scholtz/dappnode-participation-node-voitest/blob/main/README.md" target="_blank">
                <LinkOutline class="inline" />
                <span class="m-2">Guide to Setting up a Participation Node on <b>DappNode</b></span>
            </A>
        </li>
    </ul>
    <ul class="m-10">
        <header class="bg-gray-50 py-4 px-8">
            <h1 class="text-xl font-bold">Additional Resources and Guides</h1>
        </header>
        <li>
            <A href="https://voi-node-info.boeieruurd.com/" target="_blank">
                <LinkOutline class="inline" />
                <span class="m-2">VOI Node Metrics (Node Stats)</span>
            </A>
        </li>
        <li>
			<A href="https://github.com/scholtz/dappnode-participation-node-voitest/blob/main/README.md" target="_blank">
                <LinkOutline class="inline" />
                <span class="m-2">Guide to Set up a <b>Relay Node</b></span>
            </A>
            <div class="ml-7 text-sm">Relay nodes are the backbone of the network.</div>
		</li>
	</ul>
    <ul class="m-10">
        <header class="bg-gray-50 py-4 px-8">
            <h1 class="text-xl font-bold">Need Help?</h1>
            <h2 class="text-lg font-medium text-gray-600">More Links and Resources</h2>
        </header>
		<li>
			<A href="https://voi.network" target="_blank"><GlobeOutline class="inline" />
                <span class="m-2">VOI Website</span>
            </A>
		</li>
		<li>
            <A href="https://t.co/mXYdYkWE6i" target="_blank"><DiscordSolid class="inline" />
                <span class="m-2">VOI Discord</span>
            </A>
        </li>
		<li>
			<A href="https://twitter.com/Voi_Net" target="_blank"><TwitterSolid class="inline" />
                <span class="m-2">@Voi_Net Twitter</span>
            </A>
		</li>
	</ul>
</div>
