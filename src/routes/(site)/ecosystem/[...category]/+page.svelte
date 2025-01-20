<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchProjects } from '../../phase2/[...slug]/projects';
  import type { IProject } from '$lib/data/types';

  let projects: IProject[] = [];
  const categorySort = ['Wallets', 'DEXes', 'NFTs' ];

  const categoryDescriptions: Record<string, string> = {
    Wallets: 'Get started with Voi by downloading a Wallet.',
    DEXes: 'Trade your assets on decentralized exchanges.',
    NFTs: 'Explore unique digital assets and collectibles.',
    Infrastructure: 'Discover the backbone of the Voi ecosystem.',
    Tools: 'Enhance your experience with these tools.',
  };

  onMount(async () => {
    projects = await fetchProjects();
  });

  $: projectsByCategory = categorySort.reduce((acc, category) => {
    let filteredProjects = projects.filter(project => project.category === category && project.status === 'active');
    
    if (category === 'Wallets') {
      const walletOrder = ["Kibisis", "Biatec Wallet (A-Wallet)", "Lute"];
      filteredProjects.sort((a, b) => {
        const indexA = walletOrder.indexOf(a.title);
        const indexB = walletOrder.indexOf(b.title);
        return indexA - indexB;
      });
    }
    
    acc[category] = filteredProjects;
    return acc;
  }, {} as Record<string, IProject[]>);
</script>

<div class="landing-page">
  <header class="hero parallax bg-black text-[#00ff00]">
    <div class="container mx-auto px-4 py-20 text-center relative z-10">
      <h1 class="text-6xl font-bold mb-4 text-[#00ff00] glow-text uppercase tracking-wider">Voi Ecosystem Hub</h1>
      <p class="text-2xl mb-12 text-[#ff00ff] glow-text-pink">Discover the future of Community Blockchain 🚀</p>
      
      <div class="mt-28">
        <h2 class="text-3xl font-semibold mb-4 text-[#00ffff] glow-text-cyan">Need Voi? 💎🙌</h2>
        <a 
          href="https://www.mexc.com/exchange/VOI_USDT"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block bg-[#00ff00] hover:bg-[#00ff00]/80 text-black font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-neon"
        >
          Buy on MEXC 🌙
        </a>
      </div>
    </div>
    <div class="absolute inset-0">
      <div class="stars"></div>
      <div class="twinkling"></div>
    </div>
  </header>

  {#each categorySort as category, index}
    <section class={`py-20 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`}>
      <div class="container mx-auto px-4">
        <div class="flex flex-col md:flex-row items-center">
          <div class="md:w-1/2 mb-8 md:mb-0 {index % 2 === 0 ? 'md:pr-8' : 'md:pl-8 md:order-2'}">
            <h2 class="text-4xl font-bold text-purple-800 mb-4">{category}</h2>
            <p class="text-xl text-gray-700 mb-6">{categoryDescriptions[category]}</p>
          </div>
          <div class="md:w-1/2 {index % 2 === 0 ? '' : 'md:order-1'}">
            <ul class="grid grid-cols-2 gap-4">
              {#each projectsByCategory[category] || [] as project}
                <li>
                  <a 
                    href={project.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    class="flex items-center justify-center p-2 rounded-lg hover:bg-purple-100 transition-colors duration-200"
                  >
                    {#if project.logo}
                      <img src={project.logo} alt={project.title} class="mr-2 object-contain h-[{project.title === 'Lute' ? '4rem' : '5rem'}]" />
                    {:else}
                      <div class="w-8 h-8 mr-2 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                        {project.title[0]}
                      </div>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>            
          </div>
        </div>
      </div>
    </section>
  {/each}

  <!-- Discover more section -->
  <section class="py-20 bg-black">
    <div class="container mx-auto px-4 text-center">
      <h2 class="text-4xl font-bold text-[#00ffff] glow-text-cyan mb-6">Discover More</h2>
      <p class="text-xl text-[#ff00ff] glow-text-pink mb-8">Explore the full range of projects and opportunities in the Voi ecosystem.</p>
      <a 
        href="/directory" 
        rel="noopener noreferrer" 
        class="inline-block bg-[#ff00ff] text-white font-bold py-3 px-6 rounded-lg hover:bg-[#ff00ff]/80 transition-all duration-200 transform hover:scale-105 shadow-neon-pink"
      >
        Visit the Voi Directory 🚀
      </a>
    </div>
  </section>

  <footer class="bg-black text-[#00ff00] py-10">
    <div class="container mx-auto px-4 text-center">
      <p class="glow-text">&copy; 2024 Voi Rewards. All rights reserved. 💎</p>
    </div>
  </footer>
</div>

<style>
  .landing-page {
    overflow-x: hidden;
    background-color: black;
  }

  .parallax {
    background-attachment: fixed;
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
  }

  .hero {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  @keyframes twinkle {
    0% { opacity: 0; }
    50% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes move {
    from { transform: translateY(0px); }
    to { transform: translateY(-2000px); }
  }

  .stars {
    background: #000 url(http://www.script-tutorials.com/demos/360/images/stars.png) repeat top center;
    z-index: 0;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    animation: move 150s linear infinite;
  }

  .twinkling {
    background: transparent url(http://www.script-tutorials.com/demos/360/images/twinkling.png) repeat top center;
    z-index: 1;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    animation: move 100s linear infinite;
  }

  .glow-text {
    text-shadow: 0 0 10px #00ff00;
  }

  .glow-text-pink {
    text-shadow: 0 0 10px #ff00ff;
  }

  .glow-text-cyan {
    text-shadow: 0 0 10px #00ffff;
  }

  .shadow-neon {
    box-shadow: 0 0 15px #00ff00;
  }

  .shadow-neon-pink {
    box-shadow: 0 0 15px #ff00ff;
  }

  @media (max-width: 768px) {
    .parallax {
      background-attachment: scroll;
    }
  }
</style>
