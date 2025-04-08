<script lang="ts">
  import { Navbar, NavBrand, DarkMode, Avatar, Dropdown, DropdownItem, DropdownDivider } from 'flowbite-svelte';
  import { page } from '$app/stores';
  import { slide } from 'svelte/transition';
  import { onMount } from 'svelte';
  
  interface NavItem {
    href: string;
    label: string;
    external?: boolean;
  }

  interface ResourceItem {
    href: string;
    label: string;
    icon: string;
  }

  interface WalletItem {
    href: string;
    label: string;
    icon: string;
  }
  
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
  
  const navItems: NavItem[] = [
    { href: '/', label: 'Home' },
    { href: '/markets', label: 'Markets' },
    { href: '/analytics', label: 'Analytics' },
    { href: 'https://ecosystem.voi.network', label: 'Ecosystem', external: true }
  ];

  const resourceItems: ResourceItem[] = [
    { href: '/directory', label: 'Directory', icon: 'fas fa-book' },
    { href: '/faq', label: 'FAQ', icon: 'fas fa-question-circle' },
    { href: '/what_is_voi', label: 'What is Voi?', icon: 'fas fa-info-circle' },
    { href: '/how_to_node', label: 'Run a Node', icon: 'fas fa-server' },
    { href: '/calculator', label: 'Rewards Calculator', icon: 'fas fa-calculator' },
    { href: '/privacy', label: 'Privacy Policy', icon: 'fas fa-shield-alt' }
  ];

  const walletItems: WalletItem[] = [
    { href: '/wallet#portfolio', label: 'Portfolio', icon: 'fas fa-wallet' },
    { href: '/wallet#consensus', label: 'Consensus', icon: 'fas fa-hexagon-nodes' },
    { href: '/wallet#proposals', label: 'Proposals', icon: 'fas fa-chart-line' },
    { href: '/wallet#epochs', label: 'Epochs', icon: 'fas fa-calendar-alt' },
    { href: '/wallet#lockvest', label: 'Lock+Vest', icon: 'fas fa-key' },
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

<Navbar fluid={true} class="bg-gradient-to-r from-white to-gray-50 dark:from-slate-900 dark:to-slate-800 text-gray-700 dark:text-gray-100 border-b border-gray-200 dark:border-slate-700/50 shadow-sm">
  <NavBrand href="https://voirewards.com" class="float-left">
    <img src="/android-chrome-192x192.png" class="ml-4 sm:ml-12 mt-2 mr-3 h-10 sm:h-14" alt="Logo" />
    <div class="nav-title whitespace-nowrap text-xl sm:text-2xl font-semibold text-gray-800 dark:text-white">Voi Rewards Auditor</div>
  </NavBrand>
  
  <!-- Desktop Navigation -->
  <div class="hidden sm:flex flex-row items-center ml-auto gap-2 mr-4">
    {#each navItems as {href, label, external}}
      <a 
        {href} 
        class="text-lg navButton flex items-center text-gray-600 dark:text-gray-200" 
        class:selected={activeLink ? isActiveLink(href) : false}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {label}
        {#if external}
          <i class="fas fa-external-link-alt ml-2 text-xs opacity-70"></i>
        {/if}
      </a>
    {/each}

    <!-- Resources Menu -->
    <div class="relative flex items-center">
      <button id="resources-menu" class="text-lg navButton flex items-center text-gray-600 dark:text-gray-200" aria-label="Open Resources Menu">
        Resources
        <i class="fas fa-chevron-down ml-2 text-sm"></i>
      </button>
      <Dropdown triggeredBy="#resources-menu" class="w-56">
        {#each resourceItems as item}
          <DropdownItem on:click={() => handleItemClick(item.href)} class="py-2">
            <i class="{item.icon} mr-2"></i>
            <span class="truncate">{item.label}</span>
          </DropdownItem>
        {/each}
      </Dropdown>
    </div>
    
    <!-- Wallet Menu -->
    <div class="relative flex items-center gap-2">
      <button id="avatar-menu" class="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors rounded-full" aria-label="Open Wallet Menu">
        <i class="fas fa-wallet text-lg"></i>
      </button>
      <Dropdown triggeredBy="#avatar-menu" class="w-56">
        <div class="px-4 py-2">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Wallet Options</div>
          {#each walletItems as item}
            <DropdownItem on:click={() => handleItemClick(item.href)} class="py-2">
              <i class="{item.icon} mr-2"></i>
              <span class="truncate">{item.label}</span>
            </DropdownItem>
          {/each}
        </div>
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
    class="fixed right-0 top-0 h-full w-64 bg-gradient-to-b from-white to-gray-50 dark:from-slate-900 dark:to-slate-800 z-50 shadow-lg touch-pan-x flex flex-col"
    on:touchstart={handleTouchStart}
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}
    on:touchcancel={handleTouchEnd}
  >
    <!-- Swipe hint -->
    <div class="text-gray-400 dark:text-white/50 text-sm text-center py-2 border-b border-gray-200 dark:border-slate-700">
      Swipe right to close
    </div>
    
    <div class="flex-1 overflow-y-auto">
      <div class="flex flex-col p-4 space-y-4">
        {#each navItems as {href, label, external}}
          <a
            {href}
            class="text-gray-700 dark:text-white text-lg py-2 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center"
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
              <i class="fas fa-external-link-alt ml-2 text-xs opacity-70"></i>
            {/if}
          </a>
        {/each}

        <!-- Mobile Resources Menu -->
        <div class="border-t border-gray-200 dark:border-slate-700 pt-4 mt-4">
          <div class="text-gray-500 dark:text-white/70 text-sm font-medium px-4 mb-2">Resources</div>
          {#each resourceItems as item}
            <a
              href={item.href}
              class="text-gray-700 dark:text-white text-lg py-2 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center"
              on:click={() => {
                closeMenu();
              }}
            >
              <i class="{item.icon} mr-2"></i>
              {item.label}
            </a>
          {/each}
        </div>

        <!-- Mobile Wallet Menu -->
        <div class="border-t border-gray-200 dark:border-slate-700 pt-4 mt-4">
          <div class="text-gray-500 dark:text-white/70 text-sm font-medium px-4 mb-2">Wallet Options</div>
          {#each walletItems as item}
            <a
              href={item.href}
              class="text-gray-700 dark:text-white text-lg py-2 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center"
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
        <div class="border-t border-gray-200 dark:border-slate-700 pt-4">
          <div class="flex items-center justify-between px-4 py-2">
            <span class="text-gray-700 dark:text-white text-lg">Dark Mode</span>
            <DarkMode class="ml-3" on:change={handleDarkModeChange} />
          </div>
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
    background-color: theme('colors.gray.100');
    color: theme('colors.gray.900');
  }

  :global(.dark) .navButton:hover,
  :global(.dark) .selected {
    background-color: rgb(51, 65, 85);
    color: white;
  }
</style>