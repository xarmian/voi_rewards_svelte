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
  <header class="hero parallax bg-purple-900 text-white">
    <div class="container mx-auto px-4 py-20 text-center">
      <h1 class="text-6xl font-bold mb-4">Voi Ecosystem Hub</h1>
      <p class="text-2xl mb-12">Discover the future of Community Blockchain</p>
      
      <div class="mt-28">
        <h2 class="text-3xl font-semibold mb-4">Need Voi?</h2>
        <a 
          href="https://www.mexc.com/exchange/VOI_USDT"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg transition-colors duration-200"
        >
          Buy on MEXC
        </a>
      </div>
    </div>
    <div></div>
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
  <section class="py-20 bg-purple-100">
    <div class="container mx-auto px-4 text-center">
      <h2 class="text-4xl font-bold text-purple-800 mb-6">Discover More</h2>
      <p class="text-xl text-gray-700 mb-8">Explore the full range of projects and opportunities in the Voi ecosystem.</p>
      <a 
        href="/directory" 
        rel="noopener noreferrer" 
        class="inline-block bg-purple-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors duration-200"
      >
        Visit the Voi Directory
      </a>
    </div>
  </section>

  <footer class="bg-purple-900 text-white py-10">
    <div class="container mx-auto px-4 text-center">
      <p>&copy; 2024 Voi Rewards. All rights reserved.</p>
    </div>
  </footer>
</div>

<style>
  .landing-page {
    overflow-x: hidden;
  }

  .parallax {
    background-attachment: fixed;
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
  }

  .hero {
    background-image: url('https://source.unsplash.com/random/1920x1080?blockchain');
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .parallax-image {
    background-attachment: fixed;
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    transition: transform 0.3s ease-out;
  }

  .parallax-image:hover {
    transform: scale(1.05);
  }

  @media (max-width: 768px) {
    .parallax, .parallax-image {
      background-attachment: scroll;
    }
  }
</style>
