<script lang="ts">
	import { TwitterSolid, DiscordSolid, GlobeOutline } from 'flowbite-svelte-icons';
    import { A } from 'flowbite-svelte';
</script>

<div class="about">
    <header class="bg-gray-100 py-4 px-8">
        <h1 class="text-2xl font-bold">What is Voi?</h1>
        <!--<h2 class="text-lg font-medium text-gray-600"></h2>-->
    </header>
    <p class="m-5">
        <A href="https://voi.network" target="_blank" class="text-blue-800 dark:text-blue-200">VOI</A> is a a Layer-1 Blockchain Network built using
        <A href="https://algorand.com" target="_blank" class="text-blue-800 dark:text-blue-200">Algorand</A> technology.
        This website is an unofficial resource.
        It is not affiliated with the VOI Core Team.
    </p>
    <p class="m-5">
        The network is currently in TestNet, and TestNet is a game. Token amounts will reset prior to MainNet.
    </p>
    <p class="m-5">
        For more information about VOI, see the resources below:
    </p>
    <ul class="m-5">
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
