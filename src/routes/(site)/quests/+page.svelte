<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import VoiLogo from '$lib/assets/Voi_Logo_Animation_White_on_Purple_Background1080x1080.gif';
    import projects from '../phase2/[...slug]/projects';
    import { browser } from '$app/environment';
	import { MetaTags } from 'svelte-meta-tags';
    import type { MetaTagsProps } from 'svelte-meta-tags';

    // filter projects list by title, keep only the titles in the keep array and sort by keep array
    const keep = ['Kibisis', 'Nomadex', 'Humble', 'Nautilus', 'NFT Navigator', 'High Forge'];
    const filteredProjects = projects.filter(project => keep.includes(project.title)).sort((a, b) => keep.indexOf(a.title) - keep.indexOf(b.title));

    onMount(() => {
        if (browser) {
            const arrow = document.querySelector('.arrow');

            arrow?.addEventListener('click', () => {
                window.scroll({
                    top: window.innerHeight,
                    behavior: 'smooth'
                });
            });
        }
    });

    onDestroy(() => {
        if (browser) {
            const arrow = document.querySelector('.arrow');

            arrow?.removeEventListener('click', () => {
                window.scroll({
                    top: window.innerHeight,
                    behavior: 'smooth'
                });
            });
        }
    });

</script>

<MetaTags
  title="Voi Testnet Quests"
  titleTemplate="%s | Voi Rewards Auditor"
  description="Get Your Quest On, with the Voi Testnet Network"
  openGraph={{
    url: 'Get Your Quest On, with the Voi Testnet Network',
    title: 'Voi Testnet Quests',
    description: 'Get Your Quest On, with the Voi Testnet Network',
    images: [
      {
        url: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
        width: 192,
        height: 192,
        alt: 'Voi Logo'
      },
      {
        url: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
        width: 512,
        height: 512,
        alt: 'Voi Logo'
      },
    ],
    siteName: 'VoiTestnetQuests'
  }}
  twitter={{
    cardType: 'summary',
    title: 'Voi Testnet Quests',
    description: 'Get Your Quest On, with the Voi Testnet Network',
    image: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
    imageAlt: 'Voi Logo'
  }}
/>
<div class="h-screen flex flex-col justify-center items-center text-white" style="background-color: rgb(111,42,226)">
    <img src={VoiLogo} alt="Voi Logo" class="-mt-72 h-96 animate-pulse">
    <h1 class="text-6xl font-bold mb-8 -mt-36 z-10">Get Your<br class="sm:hidden"/> Quest On</h1>
    <div class="arrow cursor-pointer mb-8">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-12 w-12 animate-bounce">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
    </div>
</div>

<div class="p-4 sm:p-12 text-white flex flex-col justify-center items-center bg-blue-500">
    <div class="flex justify-center space-x-4">
        <div class="self-center">Need Testnet VOI?</div>
        <a href="https://voiager.org/get-started" target="_blank" class="flex flex-col items-center py-2 px-4 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">
            <i class="fas fa-faucet text-3xl"></i>
            <div>$VOI Faucet</div>
        </a>
        <a href="https://faucet.nautilus.sh" target="_blank" class="flex flex-col items-center py-2 px-4 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-700">
            <i class="fas fa-faucet text-3xl"></i>
            <div>$VIA Faucet</div>
        </a>
    </div>
</div>

{#each filteredProjects as project, i}
    <div class={`p-4 sm:p-20 text-white flex flex-row justify-between ${i % 2 === 0 ? 'bg-blue-300' : 'bg-blue-500 flex-row-reverse'}`}>
        <div class='flex flex-col max-w-screen-sm'>
            <img src={project.logo} alt={project.title} class="w-52" />
            <h1 class="hidden text-6xl font-bold mb-8">{project.title}</h1>
            <p class="text-xl mb-8">{project.description}</p>
        </div>
        <div class={`flex flex-col justify-center space-y-4 ${i % 2 === 0 ? '' : 'mr-2'}`}>
            {#if project.url}
                <a href={project.url} target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">{project.title} Website</a>
            {/if}
            {#if project.guide}
                <a href={project.guide} target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Project Quests</a>
            {/if}
            {#if project.galxe}
                <a href={project.galxe} target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Social Quests</a>
            {/if}
            {#if project.twitter}
                <a href={project.twitter} target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">
                    <i class="fab fa-twitter"></i>
                    Twitter
                </a>
            {/if}
        </div>
    </div>
{/each}
<div class="p-4 sm:p-20 text-white flex flex-col justify-center items-center {filteredProjects.length % 2 === 0 ? 'bg-blue-300' : 'bg-blue-500'}">
    <h1 class="text-6xl font-bold mb-8">Hungry for more Quests?</h1>
    <p class="text-xl mb-8">Check out the Phase 2 Quests page for more Projects, Quests, and Real-time Status Tracking.</p>
    <a href="/phase2" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Go to Phase 2 Quest Tracker</a>
</div>