<script lang="ts">
  import { Navbar, NavBrand, DarkMode, Avatar, Dropdown, DropdownItem, DropdownDivider } from 'flowbite-svelte';
  import Icon from '$lib/assets/android-chrome-192x192.png';
  import { page } from '$app/stores';
  import { slide } from 'svelte/transition';
  import { onMount } from 'svelte';
  
  let isMenuOpen = false;
  let isDark = false;
  
  onMount(() => {
    isDark = document.documentElement.classList.contains('dark');
  });
  
  $: activeLink = $page.url.pathname;
  let touchStart = 0;
  let touchX = 0;
  let menuElement: HTMLElement;
  let isDragging = false;
  let menuPosition = 0;
  
  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/ecosystem', label: 'Ecosystem' },
    { href: '/faq', label: 'FAQ' },
    { href: '/what_is_voi', label: 'What is Voi?' },
    { href: '/how_to_node', label: 'Run a Node' }
  ];

  const isActiveLink = (href: string): boolean => {
    if (href === '/') {
      return activeLink === '/';
    }
    return activeLink.includes(href);
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStart = e.touches[0].clientX;
    isDragging = true;
    menuElement.style.transition = 'none';
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    
    touchX = e.touches[0].clientX;
    const diff = touchX - touchStart;
    
    // Only allow sliding to the right (positive diff)
    if (diff > 0) {
      menuPosition = diff;
      menuElement.style.transform = `translateX(${menuPosition}px)`;
    }
  };

  const handleTouchEnd = () => {
    isDragging = false;
    menuElement.style.transition = 'transform 0.2s ease-out';
    
    // If menu is dragged more than 100px to the right, close it
    if (menuPosition > 100) {
      closeMenu();
    } else {
      // Reset position
      menuElement.style.transform = 'translateX(0)';
    }
    menuPosition = 0;
  };

  const toggleMenu = () => {
    isMenuOpen = !isMenuOpen;
  };

  const closeMenu = () => {
    isMenuOpen = false;
  };
</script>

<Navbar fluid={true} class="!bg-[rgb(111,42,226)] text-white dark:text-gray-100">
  <NavBrand href="https://voirewards.com" class="float-left">
    <img src="{Icon}" class="ml-4 sm:ml-12 mt-2 mr-3 h-10 sm:h-14" alt="Logo" />
    <div class="nav-title whitespace-nowrap text-xl sm:text-2xl font-semibold">Voi Rewards Auditor</div>
  </NavBrand>
  
  <!-- Desktop Navigation -->
  <div class="hidden sm:flex flex-row items-center ml-auto gap-2 mr-4">
    {#each navItems as {href, label}}
      <a 
        {href} 
        class="text-lg navButton" 
        class:selected={activeLink ? isActiveLink(href) : false} 
        on:click={() => activeLink = href}
      >
        {label}
      </a>
    {/each}
    
    <!-- Account Menu -->
    <div class="relative flex items-center gap-2">
      <Avatar id="avatar-menu" src="https://api.dicebear.com/7.x/avataaars/svg?seed=voi" class="cursor-pointer" />
      <Dropdown triggeredBy="#avatar-menu" class="w-48">
        <DropdownItem href="/wallet#consensus">Consensus</DropdownItem>
        <DropdownItem href="/wallet#proposals">Proposals</DropdownItem>
        <DropdownItem href="/wallet#epochs">Epochs</DropdownItem>
        <DropdownItem href="/wallet#calculator">Calculator</DropdownItem>
        <DropdownDivider />
        <div class="px-4 py-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-700 dark:text-gray-200">Dark Mode</span>
            <DarkMode class="ml-3" />
          </div>
        </div>
      </Dropdown>
    </div>
  </div>

  <!-- Mobile Menu Button -->
  <button
    class="sm:hidden ml-auto p-2 focus:outline-none"
    on:click={toggleMenu}
    aria-label="Toggle menu"
  >
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path 
        stroke-linecap="round" 
        stroke-linejoin="round" 
        stroke-width="2" 
        d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
      />
    </svg>
  </button>
</Navbar>

<!-- Mobile Menu Overlay -->
{#if isMenuOpen}
  <div 
    class="fixed inset-0 bg-black bg-opacity-50 z-40"
    on:click={closeMenu}
    aria-label="Close Menu"
    aria-hidden="true"
  ></div>
{/if}

<!-- Mobile Menu Drawer -->
{#if isMenuOpen}
  <div
    bind:this={menuElement}
    transition:slide={{ duration: 200 }}
    class="fixed right-0 top-0 h-full w-64 bg-[rgb(111,42,226)] z-50 shadow-lg touch-pan-x"
    on:touchstart={handleTouchStart}
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}
    on:touchcancel={handleTouchEnd}
  >
    <div class="flex flex-col p-4 space-y-4">
      <!-- Swipe hint -->
      <div class="text-white/50 text-sm text-center pb-2">
        Swipe right to close
      </div>
      
      {#each navItems as {href, label}}
        <a
          {href}
          class="text-white text-lg py-2 px-4 rounded-lg hover:bg-[#d0bff2] hover:text-black transition-colors"
          class:selected={activeLink ? isActiveLink(href) : false}
          on:click={() => {
            activeLink = href;
            closeMenu();
          }}
        >
          {label}
        </a>
      {/each}

      <!-- Mobile Account Menu Items -->
      <div class="border-t border-purple-400 pt-4">
        <a href="/wallet" class="text-white text-lg py-2 px-4 rounded-lg hover:bg-[#d0bff2] hover:text-black transition-colors">My Account</a>
        <a href="/wallet/assets" class="text-white text-lg py-2 px-4 rounded-lg hover:bg-[#d0bff2] hover:text-black transition-colors">Assets</a>
        <a href="/wallet/transactions" class="text-white text-lg py-2 px-4 rounded-lg hover:bg-[#d0bff2] hover:text-black transition-colors">Transactions</a>
        <a href="/accounts" class="text-white text-lg py-2 px-4 rounded-lg hover:bg-[#d0bff2] hover:text-black transition-colors">Link Accounts</a>
        <div class="flex items-center justify-between py-2 px-4">
          <span class="text-white text-lg">Dark Mode</span>
          <DarkMode class="ml-3" />
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  img {
    max-width: 100%;
    border-radius: 50%;
    overflow: hidden;
  }

  .navButton {
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    transition: all 0.2s;
  }

  .navButton:hover,
  .selected {
    background-color: #d0bff2;
    color: black;
  }
</style>