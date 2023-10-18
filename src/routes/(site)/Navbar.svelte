<script>
  import { Navbar, NavBrand, NavLi, NavUl, NavHamburger, Button, Input, DarkMode } from 'flowbite-svelte';
  import Icon from '$lib/assets/android-chrome-192x192.png';
  //import { SearchOutline } from 'flowbite-svelte-icons';
</script>

<Navbar fluid={true}>
  <NavBrand href="/">
    <img src="{Icon}" class="mr-3 h-10 sm:h-20" alt="Logo" />
    <span class="whitespace-nowrap text-xl font-semibold dark:text-white">Voi Rewards Auditor</span>
  </NavBrand>
  <div class="flex md:order-2">
    <DarkMode />
    <span class='spacer'></span>
    <!--<Button color="none" data-collapse-toggle="mobile-menu-3" aria-controls="mobile-menu-3" aria-expanded="false" class="md:hidden text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 mr-1">
      <SearchOutline class="w-5 h-5" />
    </Button>
    <div class="hidden relative md:block">
      <div class="flex absolute inset-y-0 left-0 items-center pl-3 pointer-events-none">
        <SearchOutline class="w-4 h-4" />
      </div>
      <Input id="search-navbar" class="pl-10" placeholder="Search..." />
    </div>-->
    <NavHamburger />
  </div>
  <NavUl>
    <NavLi class="text-xl" href="/" active={true}>Home</NavLi>
    <NavLi class="text-xl" href="/about">About</NavLi>
    <NavLi class="text-xl" href="/what_is_voi">What is Voi?</NavLi>
  </NavUl>
</Navbar>
<hr/>

<style>
  img {
    max-width: 100%;
    border-radius: 50%;
    overflow: hidden;
 }
  .spacer {
    width: 10px;
    display:inline-block;
  }
</style>