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
    { href: '/directory', label: 'Directory' },
    { href: '/faq', label: 'FAQ' },
    { href: '/what_is_voi', label: 'What is Voi?' },
    { href: '/how_to_node', label: 'Run a Node' },
    { href: 'https://ecosystem.voi.network', label: 'Ecosystem', external: true }
  ];

  const dropdownItems = [
    { href: '/wallet#consensus', label: 'Consensus', icon: 'fas fa-hexagon-nodes' },
    { href: '/wallet#proposals', label: 'Proposals', icon: 'fas fa-chart-line' },
    { href: '/wallet#epochs', label: 'Epochs', icon: 'fas fa-calendar-alt' },
    { href: '/wallet#calculator', label: 'Calculator', icon: 'fas fa-calculator' }
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

  let dropdownInstance: any;
  
  const closeDropdown = () => {
    dropdownInstance?.hide();
  };

  const handleItemClick = (href: string) => {
    // Find and click the avatar to close the dropdown
    const avatar = document.getElementById('avatar-menu');
    avatar?.click();
    // Navigate after a small delay to ensure dropdown closes
    setTimeout(() => {
      window.location.href = href;
    }, 100);
  };

  function handleDarkModeChange(e: CustomEvent) {
    const isDark = e.detail;
    if (isDark) {
      localStorage.setItem('color-theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      localStorage.setItem('color-theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  }
</script>

<Navbar fluid={true} class="!bg-[rgb(111,42,226)] text-white dark:text-gray-100">
  <NavBrand href="https://voirewards.com" class="float-left">
    <img src="{Icon}" class="ml-4 sm:ml-12 mt-2 mr-3 h-10 sm:h-14" alt="Logo" />
    <div class="nav-title whitespace-nowrap text-xl sm:text-2xl font-semibold">Voi Rewards Auditor</div>
  </NavBrand>
  
  <!-- Desktop Navigation -->
  <div class="hidden sm:flex flex-row items-center ml-auto gap-2 mr-4">
    {#each navItems as {href, label, external}}
      <a 
        {href} 
        class="text-lg navButton flex items-center" 
        class:selected={activeLink ? isActiveLink(href) : false}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        on:click={() => activeLink = href}
      >
        {label}
        {#if external}
          <span class="ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </span>
        {/if}
      </a>
    {/each}
    
    <!-- Account Menu -->
    <div class="relative flex items-center gap-2">
      <button id="avatar-menu" class="w-10 h-10 flex items-center justify-center bg-[#d0bff2] text-black hover:bg-white transition-colors rounded-full">
        <i class="fas fa-wallet text-lg"></i>
      </button>
      <Dropdown triggeredBy="#avatar-menu" class="w-48">
        {#each dropdownItems as item}
          <DropdownItem on:click={() => handleItemClick(item.href)}>
            <i class="{item.icon} mr-2"></i>
            {item.label}
          </DropdownItem>
        {/each}
        <DropdownDivider />
        <div class="px-4 py-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-700 dark:text-gray-200">Dark Mode</span>
            <DarkMode class="ml-3" on:change={handleDarkModeChange} />
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
      
      {#each navItems as {href, label, external}}
        <a
          {href}
          class="text-white text-lg py-2 px-4 rounded-lg hover:bg-[#d0bff2] hover:text-black transition-colors flex items-center"
          class:selected={activeLink ? isActiveLink(href) : false}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          on:click={() => {
            activeLink = href;
            closeMenu();
          }}
        >
          {label}
          {#if external}
            <span class="ml-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </span>
          {/if}
        </a>
      {/each}

      <!-- Mobile Wallet Menu Items -->
      <div class="border-t border-purple-400 pt-4">
        <div class="text-white/70 text-sm font-medium px-4 mb-2">Wallet Options</div>
        {#each dropdownItems as item}
          <a
            href={item.href}
            class="text-white text-lg py-2 px-4 rounded-lg hover:bg-[#d0bff2] hover:text-black transition-colors flex items-center"
            on:click={() => {
              closeMenu();
            }}
          >
            <i class="{item.icon} mr-2"></i>
            {item.label}
          </a>
        {/each}
      </div>

      <!-- Dark Mode Toggle -->
      <div class="border-t border-purple-400 pt-4">
        <div class="flex items-center justify-between px-4 py-2">
          <span class="text-white text-lg">Dark Mode</span>
          <DarkMode class="ml-3" on:change={handleDarkModeChange} />
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