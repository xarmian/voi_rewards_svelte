<script lang="ts">
    import { browser } from '$app/environment';
	import ProjectModal from './ProjectModal.svelte';
    import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

    export let projectid: number | null = null;

    $: if (projectid || projectid == null) {
        if (browser && document) {
            if (projectid) {
                document.body.style.overflow = 'hidden';
            }
            else {
                document.body.style.overflow = 'auto';
            }
        }
    }
</script>

  <div class="h-screen modal" on:click={() => projectid = null} on:click|stopPropagation transition:fly={{ delay: 0, duration: 300, x: '100%', y: 0, opacity: 0.5, easing: quintOut }}>
    <div class="relative h-screen max-w-4xl overflow-auto bg-purple-200 dark:bg-purple-950 modal-content {projectid ? 'show' : ''}" on:click|stopPropagation>
    <ProjectModal projectId={projectid} />
    <button class="absolute top-4 left-4 text-white bg-gray-500 cursor-pointer rounded-full h-12 w-12 p-2" on:click={() => projectid = null}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
    </button>
    </div>
  </div>
  
<style>
.modal {
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  .modal-content {
    height: 100%;
  }
</style>

