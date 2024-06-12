<script lang="ts">
  import ProjectSlideout from './ProjectSlideout.svelte';

    import { onMount, onDestroy } from 'svelte';
    import VoiLogo from '$lib/assets/Voi_Logo_Animation_White_on_Purple_Background1080x1080.gif';
    import VoiLogoStatic from '$lib/assets/Voi_Logo_White_Transparent_Background.png';
    import projects from '../phase2/[...slug]/projects';
    import { browser } from '$app/environment';
    import Saos from "saos";
    //@ts-ignore
    import Device from 'svelte-device-info';

    let isMobile = false;
    let selectedProjectId: number | null = null;
    let logoElement: HTMLImageElement;
    let arrowElement: SVGSVGElement;

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
    const keep = ['Kibisis', 'Voi Network', 'Nomadex', 'Humble', 'High Forge', 'Nautilus', 'NFT Navigator'];
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

            if (logoElement && arrowElement) {
                setTimeout(() => {
                    logoElement.src = VoiLogoStatic;
                    arrowElement.classList.remove('animate-bounce');
                }, 30000)
            }
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
    <img bind:this={logoElement} src={VoiLogo} alt="Voi Logo" class="-mt-72 h-96">
    <h1 class="text-6xl font-bold mb-8 -mt-36 z-10">Get Your<br class="sm:hidden"/> Quest On</h1>
    <div class="arrow cursor-pointer mb-8">
        <svg bind:this={arrowElement} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-12 w-12 animate-bounce">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
    </div>
    <div class="absolute bottom-6 space-y-0 flex-row space-x-6 hidden">
        <a href='https://medium.com/@voifoundation/phase-2-of-the-incentivised-testnet-bf32d880e8f4' target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Phase 2 Announcement</a>
        <a href='https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCB1StzTo8' target="_blank" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Social Quests on Galxe</a>
    </div>
</div>

<div class="p-4 sm:p-12 text-white flex flex-col justify-center items-center bg-blue-300">
    <div class="self-center text-purple-900">Need Testnet VOI?</div>
    <div class="flex justify-center space-x-4">
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

<div class="p-4 sm:p-12 text-white flex flex-col justify-center items-center" style="background-color: rgb(111,42,226)">
    <div class="flex flex-col justify-center items-center space-y-4 sm:w-1/2">
        <h1 class="text-6xl font-bold mb-8">Quests</h1>
        <p class="text-xl mb-8">Complete quests to earn rewards and help test the Voi Network.</p>
        <p class="text-lg mb-8">Quests help test the network and introduce you to the budding Voi ecosystem. They are fun, educational, and a great way to learn about Voi while earning rewards. Points earned from quests will correlate to an airdrop following Voi's move to Mainnet, anticipated for later this year.</p>
    </div>
</div>

{#each filteredProjects as project, i}
    <div class={`p-4 md:p-20 text-white flex flex-row justify-between items-center min-h-72 md:h-72 ${i % 2 === 0 ? 'bg-blue-500' : 'bg-blue-300 flex-row-reverse'}`}>
        <Saos once={true} animation={`${!isMobile ? (i % 2 ? 'from-right' : 'from-left') : ''} 0.5s cubic-bezier(0.35, 0.5, 0.65, 0.95) both`}>
            <div class="flex flex-row justify-between shadow-2xl shadow-black bg-purple-400 border border-black p-6 sm:w-[30rem] rounded-2xl space-x-2 z-10">
                <div class='flex flex-col max-w-screen-sm h-full'>
                        <h1 class="text-3xl font-bold mb-2">{project.type}</h1>
                        <img src={project.logo} alt={project.title} class="w-52" />
                        <h1 class="hidden text-6xl font-bold mb-8">{project.title}</h1>
                        <p class="text-xl mb-8">{project.description}</p>
                    </div>
                    <Saos once={true} animation={`fadein 2s cubic-bezier(0.35, 0.5, 0.65, 0.95) both; height: 100%; align-content: center;`}>
                        <div class={`flex flex-col justify-center space-y-4`}>
                            <a on:click|stopPropagation={() => selectedProjectId = project.id} class="whitespace-nowrap cursor-pointer bg-white text-green-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-500 hover:text-white">Project Quests</a>
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
        </Saos>
    </div>
{/each}

<div class="p-4 sm:p-20 text-white flex flex-col justify-center items-center {filteredProjects.length % 2 === 0 ? 'bg-blue-500' : 'bg-blue-300'}">
    <h1 class="text-6xl font-bold mb-8">Hungry for more Quests?</h1>
    <p class="text-xl mb-8">Check out our Phase 2 Quest Tracker for more Projects, Quests, and Real-time Status Tracking.</p>
    <a href="/phase2" class="bg-white text-blue-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-500 hover:text-white">Go to Phase 2 Quest Tracker</a>
</div>

{#if selectedProjectId}
    <ProjectSlideout bind:projectid={selectedProjectId}></ProjectSlideout>
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