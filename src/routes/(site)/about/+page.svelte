<script lang="ts">
	import { TwitterSolid, DiscordSolid } from 'flowbite-svelte-icons';
    import { A } from 'flowbite-svelte';
</script>

<div class="about">
    <header class="bg-gray-100 py-4 px-8">
        <h1 class="text-2xl font-bold">About</h1>
        <h2 class="text-lg font-medium text-gray-600">What is the Voi Rewards Auditor?</h2>
    </header>
    <p class="m-5">
        <span class="text-blue-800 dark:text-blue-200">VOI Rewards Auditor</span> is a tool to help estimate calculate rewards for running a node on the VOI network.
    </p>
    <p class="m-5">
        The network is currently in TestNet, and TestNet is a game. Token amounts will reset prior to MainNet.
    </p>
    <p class="m-5">
        This website is an unofficial resource.
        It is not affiliated with the VOI Core Team.
    </p>
    <ul class="m-5">
		<li>
			<A href="https://twitter.com/xarmian" target="_blank">
                <TwitterSolid class="inline" />
                <span class="m-4">@xarmian</span>
            </A>
		</li>
	</ul>
</div>
