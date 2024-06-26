<script>
  import { Navbar, NavBrand, NavLi, NavUl, NavHamburger, Button, Input, DarkMode } from 'flowbite-svelte';
  import Icon from '$lib/assets/android-chrome-192x192.png';
  import { fly } from 'svelte/transition';
  import { page } from '$app/stores'
  
  let activeLink = $page.url.pathname;
</script>

<Navbar fluid={true} class="!bg-[rgb(111,42,226)] text-white">
  <NavBrand href="https://voirewards.com" class="float-left">
    <img src="{Icon}" class="ml-12 mt-2 mr-3 h-10 sm:h-14" alt="Logo" />
    <div class="nav-title whitespace-nowrap text-2xl font-semibold">Voi Rewards Auditor</div>
  </NavBrand>
  <div class="flex-grow"></div>
  <NavUl ulClass="flex flex-col p-4 mt-4 sm:hidden">
    <NavLi class="text-xl" href="https://voirewards.com"><div class:selected={activeLink === '/'} on:click={() => activeLink = '/'} transition:fly={{y: 50, duration: 400}}>Home</div></NavLi>
    <NavLi class="text-xl" href="/what_is_voi"><div class:selected={activeLink === '/what_is_voi'} on:click={() => activeLink = '/what_is_voi'} transition:fly={{ y: 50, duration: 400 }}>What is Voi?</div></NavLi>
    <NavLi class="text-xl" href="/how_to_node"><div class:selected={activeLink === '/how_to_node'} on:click={() => activeLink = '/how_to_node'} transition:fly={{ y: 50, duration: 400 }}>Run a Node</div></NavLi>
    <NavLi class="text-xl" href="/phase1"><div class:selected={activeLink === '/phase1'} on:click={() => activeLink = '/phase1'} transition:fly={{ y: 50, duration: 400 }}>Phase 1</div></NavLi>
    <NavLi class="text-xl" href="/phase2"><div class:selected={activeLink === '/phase2'} on:click={() => activeLink = '/phase2'} transition:fly={{ y: 50, duration: 400 }}>Phase 2</div></NavLi>
    <NavLi class="text-xl" href="/quests"><div class:selected={activeLink === '/quests'} on:click={() => activeLink = '/quests'} transition:fly={{ y: 50, duration: 400 }}>Quests</div></NavLi>
    <DarkMode />
  </NavUl>
  <div class="hidden sm:flex flex-row p-4 mt-0 text-sm font-medium place-items-center space-x-2">
    <a class="text-xl navButton" href="https://voirewards.com"><div class:selected={activeLink === '/'} on:click={() => activeLink = '/'}>Home</a>
    <a class="text-xl navButton" href="/what_is_voi" class:selected={activeLink === '/what_is_voi'} on:click={() => activeLink = '/what_is_voi'}>What is Voi?</a>
    <a class="text-xl navButton" href="/how_to_node" class:selected={activeLink === '/how_to_node'} on:click={() => activeLink = '/how_to_node'}>Run a Node</a>
    <a class="text-xl navButton" href="/phase1" class:selected={activeLink === '/phase1'} on:click={() => activeLink = '/phase1'}>Phase 1</a>
    <a class="text-xl navButton" href="/phase2" class:selected={activeLink === '/phase2'} on:click={() => activeLink = '/phase2'}>Phase 2</a>
    <DarkMode />
  </div>
  <NavHamburger />
  <a class="hidden sm:block text-lg bg-[#d0bff2] px-12 py-2 rounded-full text-black mr-8 hover:bg-white" href="/quests" on:click={() => activeLink = '/quests'}>Quests</a>
</Navbar>

<style>
  img {
    max-width: 100%;
    border-radius: 50%;
    overflow: hidden;
  }

  .navButton {
    padding: 0.5rem 1rem;
    border-radius: 9999px;
  }
  .navButton:hover,.selected {
    background-color: #d0bff2;
    color: black;
  }
</style>