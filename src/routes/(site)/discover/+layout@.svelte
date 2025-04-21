<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <main class="container mx-auto px-4 py-4 sm:py-6 max-w-6xl">
    <slot />
  </main>
</div>

<style>
  :global(body) {
    overscroll-behavior: none;
    /* Optimize for mobile webview */
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-overflow-scrolling: touch;
  }
</style>