<script lang="ts">
    import { browser } from '$app/environment';
	import ProjectModal from './ProjectModal.svelte';
    //import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

    export let projectid: number | null = null;
    export let walletId: string | undefined = undefined;

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

  <div class="n27 h-3/4 modal border-lg shadow relative z-10" on:click={() => projectid = null} on:click|stopPropagation>
    <div class="relative h-screen max-w-4xl overflow-auto bg-gray-100 dark:bg-purple-950 rounded-2xl modal-content {projectid ? 'show' : ''}" on:click|stopPropagation>
    <ProjectModal bind:projectId={projectid} bind:searchWallet={walletId} />
    <button class="absolute top-4 right-4 text-gray-400 dark:text-white border-2 border-gray-400 cursor-pointer rounded-lg h-7 w-7" on:click={() => projectid = null}>
        <i class="fas fa-times"></i>
    </button>
    </div>
  </div>
  
<style>
.modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
}

.modal-content {
    max-width: 90%;
    max-height: 90%;
    overflow: auto;
}
</style>

