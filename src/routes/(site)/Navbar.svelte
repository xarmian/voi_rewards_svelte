<script>
  import { Navbar, NavBrand, NavLi, NavUl, NavHamburger, Button, Input, DarkMode } from 'flowbite-svelte';
  import Icon from '$lib/assets/android-chrome-192x192.png';
  import { fly } from 'svelte/transition';
  import { page } from '$app/stores'
  
  let activeLink = $page.url.pathname;
</script>

<Navbar fluid={true}>
  <NavBrand href="/" class="float-left">
    <img src="{Icon}" class="mr-3 h-10 sm:h-20" alt="Logo" />
    <div class="nav-title whitespace-nowrap text-xl font-semibold dark:text-white">Voi Rewards Auditor</div>
  </NavBrand>
  <div class="flex-grow"></div>
  <NavUl>
    <NavLi class="text-xl" href="/"><div class:selected={activeLink === '/'} on:click={() => activeLink = '/'} transition:fly={{y: 50, duration: 400}}>Home</div></NavLi>
    <NavLi class="text-xl" href="/what_is_voi"><div class:selected={activeLink === '/what_is_voi'} on:click={() => activeLink = '/what_is_voi'} transition:fly={{ y: 50, duration: 400 }}>What is Voi?</div></NavLi>
    <NavLi class="text-xl" href="/how_to_node"><div class:selected={activeLink === '/how_to_node'} on:click={() => activeLink = '/how_to_node'} transition:fly={{ y: 50, duration: 400 }}>How to Node?</div></NavLi>
    <NavLi class="text-xl" href="/phase1"><div class:selected={activeLink === '/phase1'} on:click={() => activeLink = '/phase1'} transition:fly={{ y: 50, duration: 400 }}>Phase 1</div></NavLi>
    <NavLi class="text-xl" href="/phase2"><div class:selected={activeLink === '/phase2'} on:click={() => activeLink = '/phase2'} transition:fly={{ y: 50, duration: 400 }}>Phase 2</div></NavLi>
    <NavLi class="text-xl" href="/about"><div class:selected={activeLink === '/about'} on:click={() => activeLink = '/about'} transition:fly={{ y: 50, duration: 400 }}>About</div></NavLi>
  </NavUl>
  <DarkMode />
  <NavHamburger />
</Navbar>
<hr/>

<style>
  img {
    max-width: 100%;
    border-radius: 50%;
    overflow: hidden;
  }

  .selected {
    text-decoration: underline;
  }
</style>