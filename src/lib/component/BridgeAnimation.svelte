<script lang="ts">
  export let direction: 'voi-to-algorand' | 'algorand-to-voi';
  export let status: 'bridging' | 'completed';
  export let sourceToken: string;
  export let destinationToken: string;

  $: isMovingRight = direction === 'voi-to-algorand';
  
  // Determine starting and ending positions based on direction
  $: startLeft = isMovingRight ? '0%' : 'calc(100% - 16px)';
  $: endLeft = isMovingRight ? 'calc(100% - 16px)' : '0%';
  
  // Choose position based on status
  $: leftPosition = status === 'completed' ? endLeft : startLeft;
  
  // Create 3 bubbles for animation
  const bubbles = [1, 2, 3];
  
  // For debugging
  $: console.log('Direction:', direction);
  $: console.log('Status:', status);
  $: console.log('Position:', leftPosition);
</script>

<style>
  @keyframes moveRightToLeft {
    0% { left: calc(100% - 10px); opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { left: 0; opacity: 0; }
  }

  @keyframes moveLeftToRight {
    0% { left: 0; opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { left: calc(100% - 10px); opacity: 0; }
  }

  .bubble {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: rgba(59, 130, 246, 0.6);
    transform: translateY(-50%);
  }

  .move-left-to-right {
    animation: moveLeftToRight 3s infinite;
  }

  .move-right-to-left {
    animation: moveRightToLeft 3s infinite;
  }

  .bubble:nth-child(1) {
    animation-delay: 0s;
  }

  .bubble:nth-child(2) {
    animation-delay: 1s;
  }

  .bubble:nth-child(3) {
    animation-delay: 2s;
  }
</style>

<div class="w-full max-w-md mx-auto py-8">
  <div class="relative flex items-center justify-between">
    <!-- VOI Network -->
    <div class="flex flex-col items-center space-y-2">
      <div class="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
        <span class="text-white font-bold text-xl">{isMovingRight ? sourceToken : destinationToken}</span>
      </div>
      <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Voi Network</span>
    </div>

    <!-- Bridge Animation -->
    <div class="absolute left-1/2 top-8 -translate-x-1/2 w-48 h-1">
      <div class="relative w-full h-full">
        <!-- Bridge Line -->
        <div class="absolute inset-0 bg-gray-300 dark:bg-gray-700 rounded"></div>
        
        <!-- Animated bubbles during bridging -->
        {#if status === 'bridging'}
          {#each bubbles as bubble}
            <div class="bubble {isMovingRight ? 'move-left-to-right' : 'move-right-to-left'}"></div>
          {/each}
        {/if}
        
        <!-- Main Token -->
        <div
          class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-blue-500 transition-all duration-1000 ease-in-out z-10"
          style="left: {leftPosition}"
        >
          {#if status === 'bridging'}
            <div
              class="absolute inset-0 bg-blue-500 rounded-full animate-ping"
              style="animation-duration: 2s;"
            ></div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Algorand Network -->
    <div class="flex flex-col items-center space-y-2">
      <div class="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center">
        <span class="text-white font-bold text-xl">{isMovingRight ? destinationToken : sourceToken}</span>
      </div>
      <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Algorand</span>
    </div>
  </div>
</div> 