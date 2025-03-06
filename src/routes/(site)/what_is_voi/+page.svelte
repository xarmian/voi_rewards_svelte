<script lang="ts">
	import { TwitterSolid, DiscordSolid, GlobeOutline, LinkOutline } from 'flowbite-svelte-icons';
    import { A } from 'flowbite-svelte';

    const resources = [
        { icon: GlobeOutline, text: 'VOI Website', url: 'https://voi.network' },
        { icon: DiscordSolid, text: 'VOI Discord', url: 'https://discord.gg/vnFbrJrHeW' },
        { icon: TwitterSolid, text: '@Voi_Net Twitter', url: 'https://twitter.com/Voi_Net' },
        { icon: LinkOutline, text: 'Voi Subreddit', url: 'https://www.reddit.com/r/Voi_Net/' },
    ];
</script>

<div class="bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-purple-900 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
        <header class="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-6 mb-8">
            <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white">What is Voi?</h1>
        </header>

        <section class="bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden mb-8">
            <div class="p-6 space-y-4">
                <p class="text-gray-700 dark:text-gray-300">
                    <A href="https://voi.network" target="_blank" class="text-purple-600 dark:text-purple-400 font-semibold">VOI</A> is a Layer-1 Blockchain Network built using
                    <A href="https://algorand.com" target="_blank" class="text-purple-600 dark:text-purple-400 font-semibold">Algorand</A> technology.
                    This website is an unofficial resource. It is not affiliated with the VOI Core Team.
                </p>
                <p class="text-gray-700 dark:text-gray-300">
                    The network is currently in TestNet, and TestNet is a game. Token amounts will reset prior to MainNet.
                </p>
                <p class="text-gray-700 dark:text-gray-300">
                    For more information about VOI, see the resources below:
                </p>
            </div>
        </section>

        <section class="bg-white dark:bg-gray-800 shadow-md rounded-xl overflow-hidden">
            <header class="bg-purple-600 dark:bg-purple-800 py-4 px-6">
                <h2 class="text-2xl font-bold text-white">Resources</h2>
            </header>
            <ul class="py-4">
                {#each resources as resource}
                    <li class="px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition duration-150 ease-in-out">
                        <A href={resource.url} target="_blank" class="flex items-center text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400">
                            <svelte:component this={resource.icon} class="w-5 h-5 mr-3" />
                            <span>{resource.text}</span>
                        </A>
                    </li>
                {/each}
            </ul>
        </section>
    </div>
</div>