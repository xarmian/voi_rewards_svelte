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
    const keep = ['Kibisis', 'Voi Network', 'Nomadex', 'Humble', 'High Forge', 'Nautilus', 'NFT Navigator', 'AlgoLeagues'];
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

            setTimeout(() => {
                if (logoElement && arrowElement) {
                    logoElement.src = VoiLogoStatic;
                    arrowElement.classList.remove('animate-bounce');
                }
            }, 4500)
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

<div class={`${selectedProjectId ? 'blur-sm' : ''} flex flex-col items-center`} style="background-color: rgb(111,42,226)">
  <div class="h-[70vh] flex flex-col justify-evenly items-center my-24">
    <img bind:this={logoElement} src={VoiLogo} alt="Voi Logo" class="-my-48 h-[32rem] z-0 self-center object-cover object-center" style="clip-path: inset(150px 0 0 0)">
    <div class="h-screen flex flex-col justify-center items-center text-white z-10">
        <h1 class="text-6xl font-bold text-center">Get Your<br class="sm:hidden"/> Quest On</h1>
    </div>
    <div class="arrow cursor-pointer">
      <svg bind:this={arrowElement} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-12 w-12 animate-bounce">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
      </svg>
  </div>
</div>

  <div class="restofpage">
      <div class="hero-section">
          <h1>Getting Started</h1>
          <p>Get started by downloading a wallet, securing Testnet tokens, and familiarizing yourself with the Voi ecosystem.</p>
          <div class="cta-buttons flex-row flex-wrap justify-center">
            <a href='https://kibis.is/' target="_blank" class="cta-button">Wallet</a>
            <a href='https://voiager.org/get-started' target="_blank" class="cta-button">$VOI<br/>Faucet</a>
            <a href='https://faucet.nautilus.sh/' target="_blank" class="cta-button">$VIA<br/>Faucet</a>
            <a href='https://airtable.com/apphFYuejZFJJG0i6/shru2v6BXxUaAEU7O' target="_blank" class="cta-button">Ecosystem Directory</a>
            <a href='https://medium.com/@rob.sanders1/a-voiagers-guide-to-node-running-a0251194a64a' target="_blank" class="cta-button">Node Running</a>
          </div>
        </div>    
      
      <div class="p-4 sm:p-12 text-white flex flex-col justify-center items-center">
          <div class="flex flex-col justify-center items-center space-y-4 sm:w-1/2">
              <h1 class="text-6xl font-bold mb-8">Quests</h1>
              <p class="text-xl mb-8">Complete quests to earn rewards and help test the Voi Network.</p>
              <p class="text-lg mb-8">Quests help test the network and introduce you to the budding Voi ecosystem. They are fun, educational, and a great way to learn about Voi while earning rewards. Points earned from quests will correlate to an airdrop following Voi's move to Mainnet, anticipated for later this year.</p>
          </div>
      </div>

      <div class={`p-4 md:p-20 text-black flex justify-between items-center min-h-72 md:h-72 flex-row-reverse`}>
          <Saos once={true} animation={`${!isMobile ? 'from-right' : ''} 0.5s cubic-bezier(0.35, 0.5, 0.65, 0.95) both`}>
              <div class="project flex flex-row justify-between shadow-md shadow-black bg-[#65DBAB] border border-black p-6 sm:w-[30rem] rounded-2xl space-x-2 z-10">
                  <div class='flex flex-col max-w-screen-sm h-full'>
                          <h1 class="text-3xl font-bold mb-2">Social Quests</h1>
                          <svg xmlns="http://www.w3.org/2000/svg" width="139.5" height="27" fill="none"><path fill="#fff" fill-rule="evenodd" d="M21.023 2.167c.566-.26.817-.933.559-1.501a1.14 1.14 0 0 0-1.504-.564l-.016.007-16.997 12.11zm44.614 14.986V.021h1.836v17.132zm-28.718-.905q1.785 1.1 4.258 1.1 1.47 0 2.595-.44 1.15-.44 1.958-1.126a7.4 7.4 0 0 0 1.321-1.492v2.863h1.69V8.538h-7.613v1.664h5.923q0 1.69-.832 2.888a5.3 5.3 0 0 1-2.13 1.836 6.2 6.2 0 0 1-2.765.636q-1.958 0-3.377-.856a5.8 5.8 0 0 1-2.13-2.35q-.735-1.493-.734-3.304 0-1.836.734-3.304a5.75 5.75 0 0 1 2.179-2.325q1.42-.881 3.377-.881 1.86 0 3.157.758a5.4 5.4 0 0 1 2.056 2.056h2.007q-.905-2.032-2.839-3.304Q43.844.755 41.226.755q-2.422 0-4.234 1.126a7.5 7.5 0 0 0-2.766 2.986q-.978 1.884-.979 4.185 0 2.301.955 4.185a7.56 7.56 0 0 0 2.717 3.01m16.438.269q1.347.832 3.133.832 1.518 0 2.594-.587a5 5 0 0 0 1.787-1.567v1.958h1.836V4.916h-1.836v1.982a4.95 4.95 0 0 0-1.787-1.59q-1.076-.588-2.594-.588-1.785 0-3.133.856a5.67 5.67 0 0 0-2.055 2.277q-.735 1.42-.735 3.181 0 1.739.735 3.182a5.84 5.84 0 0 0 2.055 2.3m5.679-1.469q-.93.637-2.3.637-1.347 0-2.326-.637a4.15 4.15 0 0 1-1.493-1.688 5.3 5.3 0 0 1-.514-2.326q0-1.272.514-2.325A4.15 4.15 0 0 1 54.41 7.02q.979-.636 2.325-.636 1.37 0 2.3.636a4.03 4.03 0 0 1 1.445 1.69q.49 1.051.49 2.324 0 1.249-.49 2.326a4.03 4.03 0 0 1-1.444 1.688m14.607-4.21-4.724 6.315h2.325l3.475-4.993 3.451 4.993h2.35l-4.748-6.314 4.43-5.923h-2.35L74.72 9.54l-3.157-4.625h-2.35zm13.239 6.51q-1.86 0-3.255-.831a6 6 0 0 1-2.179-2.3q-.758-1.445-.758-3.183 0-1.761.734-3.181a5.55 5.55 0 0 1 2.105-2.277q1.37-.856 3.23-.856 1.886 0 3.231.856a5.56 5.56 0 0 1 2.105 2.277q.734 1.42.734 3.181v.735H82.574q.147 1.077.686 1.982.563.881 1.492 1.42.93.514 2.154.514 1.297 0 2.179-.563a4.14 4.14 0 0 0 1.37-1.493h2.007a6.05 6.05 0 0 1-2.031 2.692q-1.37 1.028-3.55 1.028m-4.283-7.293h8.322q-.246-1.566-1.322-2.618-1.077-1.053-2.84-1.053-1.761 0-2.838 1.053-1.053 1.052-1.322 2.618M27.877 1.46c.395.132.715.41.9.781s.216.794.084 1.189a1.55 1.55 0 0 1-.78.9L.48 18 26.68 1.549l.009-.005a1.55 1.55 0 0 1 1.189-.084m-5.456 9.515a.93.93 0 0 1-.413 1.247L10.23 16.954l10.928-6.39.013-.006a.93.93 0 0 1 1.25.417" clip-rule="evenodd"></path></svg>
                          <p class="text-xl mb-8">Complete Social Quests on Galxe. Register your social media account(s) and perform qualifying activities to earn Quest Points</p>
                      </div>
                      <Saos once={true} animation={`fadein 2s cubic-bezier(0.35, 0.5, 0.65, 0.95) both; height: 100%; align-content: center;`}>
                          <div class={`flex flex-col justify-center space-y-4`}>
                              <a href='https://dashboard.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCr1MtdQcK' target="_blank" class="h-16 text-center content-center w-36 bg-white text-[#672ed9] font-bold py-2 px-4 rounded-lg shadow-md hover:bg-[#672ed9] hover:text-white">Social Quests</a>
                          </div>
                      </Saos>
                  </div>
          </Saos>
      </div>

      {#each filteredProjects as project, i}
          <div class={`p-4 md:px-20 text-black flex flex-row justify-between items-center min-h-72 md:h-72 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
              <Saos once={true} animation={`${!isMobile ? (i % 2 ? 'from-right' : 'from-left') : ''} 0.5s cubic-bezier(0.35, 0.5, 0.65, 0.95) both`}>
                  <div class="project flex flex-col shadow-md shadow-black bg-[#65DBAB] border border-black p-6 sm:w-[30rem] rounded-2xl space-x-2 z-10">
                    <h1 class="text-3xl font-bold mb-2">{project.type}</h1>
                    <div class="flex flex-row justify-between">
                      <div class='flex flex-col max-w-screen-sm h-full'>
                              <img src={project.logo} alt={project.title} class="w-52" />
                              <h1 class="hidden text-6xl font-bold mb-8">{project.title}</h1>
                              <p class="text-xl mb-8">{project.description}</p>
                          </div>
                          <Saos once={true} animation={`fadein 2s cubic-bezier(0.35, 0.5, 0.65, 0.95) both; height: 100%; align-content: center;`}>
                              <div class={`flex flex-col justify-center space-y-4 align-top w-36`}>
                                  <a on:click|stopPropagation={() => selectedProjectId = project.id} class="h-16 text-center content-center whitespace-nowrap cursor-pointer bg-white text-green-500 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-500 hover:text-white">Project Quests</a>
                                  {#if project.url}
                                      <a href={project.url} target="_blank" class="h-16 text-center content-center bg-white text-[#672ed9] font-bold py-2 px-4 rounded-lg shadow-md hover:bg-[#672ed9] hover:text-white">{project.title} Website</a>
                                  {/if}
                                  {#if project.twitter}
                                      <a href={project.twitter} target="_blank" class="h-16 text-center content-center bg-white text-[#672ed9] font-bold py-2 px-4 rounded-lg shadow-md hover:bg-[#672ed9] hover:text-white">
                                          <i class="fab fa-twitter"></i>
                                          Twitter
                                      </a>
                                  {/if}
                              </div>
                          </Saos>
                      </div>
                    </div>
              </Saos>
          </div>
      {/each}
  </div>

  <div class="p-4 sm:p-20 text-white flex flex-col justify-center items-center w-full {filteredProjects.length % 2 === 0 ? 'bg-[#672ed9]' : 'bg-[#2C037A]'}">
      <h1 class="text-6xl font-bold mb-8">Hungry for more Quests?</h1>
      <p class="text-xl mb-8">Check out our Phase 2 Quest Tracker for more Projects, Quests, and Real-time Status Tracking.</p>
      <a href="/phase2" class="bg-white text-[#672ed9] font-bold py-2 px-4 rounded-lg shadow-md hover:bg-[#672ed9] hover:text-white">Go to Phase 2 Quest Tracker</a>
  </div>
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
  .restofpage {
    background: linear-gradient(to bottom, rgb(111,42,226), #2C037A);
    margin: 0;
    background-repeat: no-repeat;
  }
  .project:hover {
    transform: scale(1.05);
    transition: transform 0.5s;
  }
  .project {
    transform: scale(1.00);
    transition: transform 0.5s;
  }

  .hero-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background-color: #2C037A;
    color: white;
    text-align: center;
  }

  .hero-section h1 {
    font-size: 2.5rem;
    margin-bottom: 1rem;
  }

  .hero-section p {
    font-size: 1.2rem;
    margin-bottom: 2rem;
  }

  .hero-section .cta-buttons {
    display: flex;
    gap: 1rem;
  }

  .hero-section .cta-button {
    background-color: #65DBAB;
    color: #672ed9;
    padding: 1rem 2rem;
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: bold;
    transition: background-color 0.3s ease;
    align-content: center;
    width: 11rem;
    height: 5rem;
  }

  .hero-section .cta-button:hover {
    background-color: #672ed9;
    color: white;
  }
</style>