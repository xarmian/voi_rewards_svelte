<script lang="ts">
  import ProjectSlideout from './ProjectSlideout.svelte';
    //import VoiLogo from '$lib/assets/Voi_Logo_Animation_White_on_Purple_Background1080x1080.gif';
    import VoiLogoStatic from '$lib/assets/Voi_Logo_White_Transparent_Background.png';
    import projects from '../phase2/[...slug]/projects';
    import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
  

    export let selectedProjectId: number | null = null;

    $: if (selectedProjectId || selectedProjectId == null) {
      if (browser && document) {
          if (selectedProjectId) {
              document.body.style.overflow = 'hidden';
          }
          else {
              document.body.style.overflow = 'auto';
          }
          const p = projects.find(p => p.id === selectedProjectId);
          goto('/quests/' + encodeURIComponent(p?.title ?? ''));
      }
    }

    // filter projects list by title, keep only the titles in the keep array and sort by keep array
    const keep = ['Kibisis', 'Social Quests', 'Voi Network', 'Nomadex', 'Humble', 'High Forge', 'Nautilus', 'NFT Navigator', 'MechaSwap', 'AlgoLeagues', 'Chubs'];
    const keptProjects = projects.filter(project => keep.includes(project.title)).sort((a, b) => keep.indexOf(a.title) - keep.indexOf(b.title));
    const otherProjects = projects.filter(project => !keep.includes(project.title));
    const filteredProjects = keptProjects.concat(otherProjects);

</script>

<div class={`${selectedProjectId ? 'blur-sm' : ''} flex flex-col items-center`} style="background-color: rgb(111,42,226)">
  <div class="flex flex-col h-1/2">
    <img src={VoiLogoStatic} alt="Voi Logo" class="-my-36 h-[40rem] z-0 self-center object-cover object-center" style="clip-path: inset(180px 0 180px 0)">
    <div class="flex flex-col justify-center items-center text-white z-10 -my-16 mb-20">
        <h1 class="text-5xl font-bold text-center">Get Your<br class="sm:hidden"/> Quest On</h1>
    </div>
  </div>

  <div class="restofpage">
      <div class="hero-section py-16">
          <div class="mt-12 text-3xl">Getting Started</div>
          <div class="text-2xl my-6 w-full sm:w-1/2">Get started by downloading a wallet, securing Testnet tokens, and familiarizing yourself with the Voi ecosystem.</div>
          <div class="cta-buttons flex-row flex-wrap justify-center mt-10 mb-10 max-w-[60rem]">
            <a href='https://kibis.is/' target="_blank" class="cta-button">Wallet</a>
            <a href='https://voiager.org/get-started' target="_blank" class="cta-button">$VOI<br/>Faucet</a>
            <a href='https://faucet.nautilus.sh/' target="_blank" class="cta-button">$VIA<br/>Faucet</a>
            <a href='https://airtable.com/apphFYuejZFJJG0i6/shru2v6BXxUaAEU7O' target="_blank" class="cta-button">Ecosystem Directory</a>
            <a href='https://voinetwork.github.io/voi-swarm/getting-started/introduction/' target="_blank" class="cta-button">Node Running</a>
            <a href='https://x.com/Voi_Net' target="_blank" class="cta-button">Voi Twitter/<i class="fa-brands fa-x-twitter"></i></a>
            <a href='https://discord.gg/vnFbrJrHeW' target="_blank" class="cta-button">Voi Discord <i class="fa-brands fa-discord"></i></a>
          </div>
        </div>    
      
      <div class="p-4 sm:p-12 flex flex-col justify-center items-center text-[#6F2AE2] bg-white dark:bg-black">
        <div class="flex flex-col justify-center items-center sm:w-3/4 mb-14">
            <h1 class="text-4xl font-bold text-[#6F2AE2]">Quests</h1>
            <p class="text-xl mb-8">Complete quests to earn rewards and help test the Voi Network.</p>
            <p class="text-lg text-gray-400">Quests help test the network and introduce you to the budding Voi ecosystem. They are fun, educational, and a great way to learn about Voi while earning rewards. Points earned from quests will correlate to an airdrop following Voi's move to Mainnet, anticipated for later this year.</p>
        </div>

        <div class="flex flex-wrap place-content-center">

          {#each filteredProjects as project, i}
            <div class="project flex p-2 flex-col bg-gray-100 dark:bg-gray-800 sm:w-[20rem] rounded-lg w-[343px] h-[540px] m-1 sm:m-4">
              <div class="place-self-end text-[#41137E] px-3 rounded-lg bg-[#65DBAB] w-fit">{project.type}</div>
              <div class='p-4 h-full flex flex-col justify-between'>
                <div>
                  {#if project.title == 'Social Quests'}
                    <div class="flex flex-col h-20 justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" height="20px" class="block dark:hidden"><path fill="#000" fill-rule="evenodd" d="M21.023 2.167c.566-.26.817-.933.559-1.501a1.14 1.14 0 0 0-1.504-.564l-.016.007-16.997 12.11zm44.614 14.986V.021h1.836v17.132zm-28.718-.905q1.785 1.1 4.258 1.1 1.47 0 2.595-.44 1.15-.44 1.958-1.126a7.4 7.4 0 0 0 1.321-1.492v2.863h1.69V8.538h-7.613v1.664h5.923q0 1.69-.832 2.888a5.3 5.3 0 0 1-2.13 1.836 6.2 6.2 0 0 1-2.765.636q-1.958 0-3.377-.856a5.8 5.8 0 0 1-2.13-2.35q-.735-1.493-.734-3.304 0-1.836.734-3.304a5.75 5.75 0 0 1 2.179-2.325q1.42-.881 3.377-.881 1.86 0 3.157.758a5.4 5.4 0 0 1 2.056 2.056h2.007q-.905-2.032-2.839-3.304Q43.844.755 41.226.755q-2.422 0-4.234 1.126a7.5 7.5 0 0 0-2.766 2.986q-.978 1.884-.979 4.185 0 2.301.955 4.185a7.56 7.56 0 0 0 2.717 3.01m16.438.269q1.347.832 3.133.832 1.518 0 2.594-.587a5 5 0 0 0 1.787-1.567v1.958h1.836V4.916h-1.836v1.982a4.95 4.95 0 0 0-1.787-1.59q-1.076-.588-2.594-.588-1.785 0-3.133.856a5.67 5.67 0 0 0-2.055 2.277q-.735 1.42-.735 3.181 0 1.739.735 3.182a5.84 5.84 0 0 0 2.055 2.3m5.679-1.469q-.93.637-2.3.637-1.347 0-2.326-.637a4.15 4.15 0 0 1-1.493-1.688 5.3 5.3 0 0 1-.514-2.326q0-1.272.514-2.325A4.15 4.15 0 0 1 54.41 7.02q.979-.636 2.325-.636 1.37 0 2.3.636a4.03 4.03 0 0 1 1.445 1.69q.49 1.051.49 2.324 0 1.249-.49 2.326a4.03 4.03 0 0 1-1.444 1.688m14.607-4.21-4.724 6.315h2.325l3.475-4.993 3.451 4.993h2.35l-4.748-6.314 4.43-5.923h-2.35L74.72 9.54l-3.157-4.625h-2.35zm13.239 6.51q-1.86 0-3.255-.831a6 6 0 0 1-2.179-2.3q-.758-1.445-.758-3.183 0-1.761.734-3.181a5.55 5.55 0 0 1 2.105-2.277q1.37-.856 3.23-.856 1.886 0 3.231.856a5.56 5.56 0 0 1 2.105 2.277q.734 1.42.734 3.181v.735H82.574q.147 1.077.686 1.982.563.881 1.492 1.42.93.514 2.154.514 1.297 0 2.179-.563a4.14 4.14 0 0 0 1.37-1.493h2.007a6.05 6.05 0 0 1-2.031 2.692q-1.37 1.028-3.55 1.028m-4.283-7.293h8.322q-.246-1.566-1.322-2.618-1.077-1.053-2.84-1.053-1.761 0-2.838 1.053-1.053 1.052-1.322 2.618M27.877 1.46c.395.132.715.41.9.781s.216.794.084 1.189a1.55 1.55 0 0 1-.78.9L.48 18 26.68 1.549l.009-.005a1.55 1.55 0 0 1 1.189-.084m-5.456 9.515a.93.93 0 0 1-.413 1.247L10.23 16.954l10.928-6.39.013-.006a.93.93 0 0 1 1.25.417" clip-rule="evenodd"></path></svg>
                      <svg xmlns="http://www.w3.org/2000/svg" height="20px" class="hidden dark:block"><path fill="#FFF" fill-rule="evenodd" d="M21.023 2.167c.566-.26.817-.933.559-1.501a1.14 1.14 0 0 0-1.504-.564l-.016.007-16.997 12.11zm44.614 14.986V.021h1.836v17.132zm-28.718-.905q1.785 1.1 4.258 1.1 1.47 0 2.595-.44 1.15-.44 1.958-1.126a7.4 7.4 0 0 0 1.321-1.492v2.863h1.69V8.538h-7.613v1.664h5.923q0 1.69-.832 2.888a5.3 5.3 0 0 1-2.13 1.836 6.2 6.2 0 0 1-2.765.636q-1.958 0-3.377-.856a5.8 5.8 0 0 1-2.13-2.35q-.735-1.493-.734-3.304 0-1.836.734-3.304a5.75 5.75 0 0 1 2.179-2.325q1.42-.881 3.377-.881 1.86 0 3.157.758a5.4 5.4 0 0 1 2.056 2.056h2.007q-.905-2.032-2.839-3.304Q43.844.755 41.226.755q-2.422 0-4.234 1.126a7.5 7.5 0 0 0-2.766 2.986q-.978 1.884-.979 4.185 0 2.301.955 4.185a7.56 7.56 0 0 0 2.717 3.01m16.438.269q1.347.832 3.133.832 1.518 0 2.594-.587a5 5 0 0 0 1.787-1.567v1.958h1.836V4.916h-1.836v1.982a4.95 4.95 0 0 0-1.787-1.59q-1.076-.588-2.594-.588-1.785 0-3.133.856a5.67 5.67 0 0 0-2.055 2.277q-.735 1.42-.735 3.181 0 1.739.735 3.182a5.84 5.84 0 0 0 2.055 2.3m5.679-1.469q-.93.637-2.3.637-1.347 0-2.326-.637a4.15 4.15 0 0 1-1.493-1.688 5.3 5.3 0 0 1-.514-2.326q0-1.272.514-2.325A4.15 4.15 0 0 1 54.41 7.02q.979-.636 2.325-.636 1.37 0 2.3.636a4.03 4.03 0 0 1 1.445 1.69q.49 1.051.49 2.324 0 1.249-.49 2.326a4.03 4.03 0 0 1-1.444 1.688m14.607-4.21-4.724 6.315h2.325l3.475-4.993 3.451 4.993h2.35l-4.748-6.314 4.43-5.923h-2.35L74.72 9.54l-3.157-4.625h-2.35zm13.239 6.51q-1.86 0-3.255-.831a6 6 0 0 1-2.179-2.3q-.758-1.445-.758-3.183 0-1.761.734-3.181a5.55 5.55 0 0 1 2.105-2.277q1.37-.856 3.23-.856 1.886 0 3.231.856a5.56 5.56 0 0 1 2.105 2.277q.734 1.42.734 3.181v.735H82.574q.147 1.077.686 1.982.563.881 1.492 1.42.93.514 2.154.514 1.297 0 2.179-.563a4.14 4.14 0 0 0 1.37-1.493h2.007a6.05 6.05 0 0 1-2.031 2.692q-1.37 1.028-3.55 1.028m-4.283-7.293h8.322q-.246-1.566-1.322-2.618-1.077-1.053-2.84-1.053-1.761 0-2.838 1.053-1.053 1.052-1.322 2.618M27.877 1.46c.395.132.715.41.9.781s.216.794.084 1.189a1.55 1.55 0 0 1-.78.9L.48 18 26.68 1.549l.009-.005a1.55 1.55 0 0 1 1.189-.084m-5.456 9.515a.93.93 0 0 1-.413 1.247L10.23 16.954l10.928-6.39.013-.006a.93.93 0 0 1 1.25.417" clip-rule="evenodd"></path></svg>
                    </div>
                  {:else if project.logo}
                    <img src={project.logo} alt={project.title} class="h-20 max-w-full" />
                  {:else}
                    <div class="text-2xl h-20 content-center">{project.title}</div>
                  {/if}
                  <p class="text-lg text-[#68727D] dark:text-gray-200">{project.description}</p>
                </div>
                <div class="flex flex-col space-y-2 h-48">
                  {#if project.title == 'Social Quests'}
                    <a href={project.guide} target="_blank" class="flex h-14 w-full bg-white text-[#41137E] dark:bg-gray-700 dark:text-[#D4BFF6] rounded-md font-bold px-4 py-2 items-center space-x-2 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-300 dark:hover:border-gray-500">
                      <div class="rounded-full bg-[#D4BFF6] h-6 w-6 flex items-center justify-center">
                        <i class="fa-regular fa-comment text-[#41137E] text-xs"></i>
                      </div>
                      <div>Social Quests</div>
                      <i class="fas fa-arrow-right flex-grow text-end"></i>
                    </a>
                  {:else}
                    <a on:click|stopPropagation={() => selectedProjectId = project.id} class="flex h-14 w-full bg-white text-[#41137E] dark:bg-gray-700 dark:text-[#D4BFF6] rounded-md font-bold px-4 py-2 items-center space-x-2 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-300 dark:hover:border-gray-500">
                      <div class="rounded-full bg-[#D4BFF6] h-6 w-6 flex items-center justify-center">
                        <i class="fa-regular fa-comment text-[#41137E] text-xs"></i>
                      </div>
                      <div>Project Quests</div>
                      <i class="fas fa-arrow-right flex-grow text-end"></i>
                    </a>
                  {/if}
                  {#if project.url}
                    <a href={project.url} target="_blank" class="flex h-14 w-full bg-white text-[#41137E] dark:bg-gray-700 dark:text-[#D4BFF6] rounded-md font-bold px-4 py-2 items-center space-x-2 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-300 dark:hover:border-gray-500">
                      <div class="rounded-full bg-[#D4BFF6] h-6 w-6 flex items-center justify-center">
                        <i class="fas fa-display text-[#41137E] text-xs"></i>
                      </div>
                      <div>Website</div>
                      <i class="fas fa-arrow-right flex-grow text-end"></i>
                    </a>
                  {/if}
                  {#if project.twitter}
                    <a href={project.twitter} target="_blank" class="flex h-14 w-full bg-white text-[#41137E] dark:bg-gray-700 dark:text-[#D4BFF6] rounded-md font-bold px-4 py-2 items-center space-x-2 border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-300 dark:hover:border-gray-500">
                      <div class="rounded-full bg-[#D4BFF6] h-6 w-6 flex items-center justify-center">
                        <i class="fa-brands fa-x-twitter text-[#41137E] text-xs"></i>
                      </div> 
                      <div>Xpace (Twitter)</div>
                      <i class="fas fa-arrow-right flex-grow text-end"></i>
                    </a>
                  {/if}
                </div>
              </div>
            </div>

          {/each}
        </div>
      </div>
  </div>

  <div class="flex p-4 sm:p-20 text-white flex-col justify-center items-center w-full {filteredProjects.length % 2 === 0 ? 'bg-[#672ed9]' : 'bg-[#2C037A]'}">
      <h1 class="text-3xl font-bold mb-8">Hungry for more Quests?</h1>
      <p class="text-xl mb-8">Check out our Phase 2 Quest Tracker for more Projects, Quests, and Real-time Status Tracking.</p>
      <a href="/phase2" class="bg-[#65DBAB] text-[#672ed9] font-bold py-2 px-4 rounded-full shadow-md hover:bg-[#672ed9] hover:text-white w-1/2 text-center">Go to Phase 2 Quest Tracker</a>
  </div>
</div>
{#if selectedProjectId}
    <ProjectSlideout bind:projectid={selectedProjectId}></ProjectSlideout>
{/if}

<style>
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
    margin: 0;
    background-repeat: no-repeat;
  }

  .hero-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background-color: #3c1579;
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
    gap: 1.5rem;
  }

  .hero-section .cta-button {
    background-color: #65DBAB;
    color: #41137E;
    padding: 1rem 2rem;
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: 700;
    transition: background-color 0.3s ease;
    align-content: center;
    width: 12rem;
    height: 6rem;
    font-size: 1.2rem;
  }

  .hero-section .cta-button:hover {
    background-color: #672ed9;
    color: white;
  }

</style>