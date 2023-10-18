<script>
  import { Navbar, NavBrand, NavLi, NavUl, NavHamburger, Button, Input, DarkMode } from 'flowbite-svelte';
  import Icon from '$lib/assets/android-chrome-192x192.png';
  //import { SearchOutline } from 'flowbite-svelte-icons';
</script>

<Navbar fluid={true}>
  <NavBrand href="/" class="float-left">
    <img src="{Icon}" class="mr-3 h-10 sm:h-20" alt="Logo" />
    <div class="nav-title whitespace-nowrap text-xl font-semibold dark:text-white">Voi Rewards Auditor</div>
  </NavBrand>
  <div class="flex-grow"></div>
  <NavUl>
    <NavLi class="text-xl" href="/" active={true}>Home</NavLi>
    <NavLi class="text-xl" href="/about">About</NavLi>
    <NavLi class="text-xl" href="/what_is_voi">What is Voi?</NavLi>
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
</style>