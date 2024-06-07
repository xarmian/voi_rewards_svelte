<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import VoiLogo from '$lib/assets/Voi_Logo_Animation_White_on_Purple_Background1080x1080.gif';
    import projects from '../phase2/[...slug]/projects';
    import { browser } from '$app/environment';
    import Saos from "saos";
    //@ts-ignore
    import Device from 'svelte-device-info';
	import ProjectModal from './ProjectModal.svelte';
    import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

    let isMobile = false;
    let selectedProjectId: number | null = null;

    $: if (selectedProjectId || selectedProjectId == null) {
        if (browser && document) {
            if (selectedProjectId) {
                document.body.style.overflow = 'hidden';
            }
            else {
                document.body.style.overflow = 'auto';
            }
        }
    }

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

        isMobile = Device.isMobile;
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

<div class="h-screen flex flex-col justify-center items-center text-white relative" style="background-color: rgb(111,42,226)">
    <img src={VoiLogo} alt="Voi Logo" class="-mt-72 h-96 animate-pulse">
    <h1 class="text-6xl font-bold mb-8 -mt-36 z-10">Get Your<br class="sm:hidden"/> Quest On</h1>
    <div class="arrow cursor-pointer mb-8">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-12 w-12 animate-bounce">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
    </div>
    <div class="absolute bottom-6 space-y-0 flex-row space-x-6 hidden">
        <a href='https://medium.com/@voifoundation/phase-2-of-the-incentivised-testnet-bf32d880e8f4' target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Phase 2 Announcement</a>
        <a href='https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCB1StzTo8' target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Social Quests on Galxe</a>
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
        <div class="self-center">
            <Saos once={true} animation={`${!isMobile ? (i % 2 ? 'from-right' : 'from-left') : ''} 0.5s cubic-bezier(0.35, 0.5, 0.65, 0.95) both`}>
                <div class='flex flex-col max-w-screen-sm h-full'>
                    <img src={project.logo} alt={project.title} class="w-52" />
                    <h1 class="hidden text-6xl font-bold mb-8">{project.title}</h1>
                    <p class="text-xl mb-8">{project.description}</p>
                </div>
            </Saos>
        </div>
        <Saos once={true} animation={`fadein 2s cubic-bezier(0.35, 0.5, 0.65, 0.95) both`}>
            <div class={`flex flex-col justify-center space-y-4 ${i % 2 === 0 ? '' : 'mr-2'}`}>
                <a on:click|stopPropagation={() => selectedProjectId = project.id} class="cursor-pointer bg-white text-green-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-500 hover:text-white">Project Quests</a>
                {#if project.url}
                    <a href={project.url} target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">{project.title} Website</a>
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
        </Saos>
    </div>
{/each}

<div class="p-4 sm:p-12 text-white flex flex-col justify-center items-center" style="background-color: rgb(111,42,226)">
    <h2 class="text-4xl font-bold mb-8">Complete quests to earn rewards and help test the Voi Network.</h2>
    <p class="text-xl mb-8">Quests are designed to test the network and introduce you to the budding Voi ecosystem. They are fun, educational, and a great way to learn about Voi while earning rewards.</p>
</div>

<div class="p-4 sm:p-20 text-white flex flex-col justify-center items-center {filteredProjects.length % 2 === 0 ? 'bg-blue-300' : 'bg-blue-500'}">
    <h1 class="text-6xl font-bold mb-8">Hungry for more Quests?</h1>
    <p class="text-xl mb-8">Check out our Phase 2 Quest Tracker for more Projects, Quests, and Real-time Status Tracking.</p>
    <a href="/phase2" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Go to Phase 2 Quest Tracker</a>
</div>

{#if selectedProjectId}
  <div class="h-screen modal" on:click={() => selectedProjectId = null} on:click|stopPropagation transition:fly={{ delay: 0, duration: 300, x: '100%', y: 0, opacity: 0.5, easing: quintOut }}>
    <div class="relative h-screen max-w-4xl overflow-auto bg-purple-200 dark:bg-purple-950 modal-content {selectedProjectId ? 'show' : ''}" on:click|stopPropagation>
    <ProjectModal projectId={selectedProjectId} />
        <button class="absolute top-4 left-4 text-white bg-gray-500 cursor-pointer rounded-full h-12 w-12 p-2" on:click={() => selectedProjectId = null}>X</button>
    </div>
  </div>
{/if}

<style>
@keyframes -global-from-left {
  0% {
    transform: rotateX(50deg) translateX(-200vw) skewX(-50deg);
    opacity: 1;
  }
  100% {
    transform: rotateX(0deg) translateX(0) skewX(0deg);
    opacity: 1;
  }
}
@keyframes -global-from-right {
  0% {
    transform: rotateX(50deg) translateX(200vw) skewX(50deg);
    opacity: 1;
  }
  100% {
    transform: rotateX(0deg) translateX(0) skewX(0deg);
    opacity: 1;
  }
}
@keyframes -global-fadein {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
.modal {
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  .modal-content {
    height: 100%;
  }
</style>