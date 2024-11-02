<script lang="ts">
    import { nicknames } from '$lib/stores/nicknames';
    import { toast } from '@zerodevx/svelte-toast';

    export let address: string;
    export let showInput = false;

    let inputValue = $nicknames[address] || '';
    
    function handleSetNickname() {
        if (inputValue.trim()) {
            nicknames.setNickname(address, inputValue.trim());
            showInput = false;
            toast.push('Nickname saved');
        }
    }

    function handleRemoveNickname() {
        nicknames.removeNickname(address);
        showInput = false;
        toast.push('Nickname removed');
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            handleSetNickname();
        }
    }
</script>

{#if showInput}
    <div class="flex items-center gap-2">
        <input
            type="text"
            bind:value={inputValue}
            placeholder="Enter nickname"
            class="px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
            on:keydown={handleKeyDown}
        />
        <button
            on:click={handleSetNickname}
            class="text-green-500 hover:text-green-600"
            title="Save"
        >
            <i class="fas fa-check"></i>
        </button>
        <button
            on:click={() => showInput = false}
            class="text-red-500 hover:text-red-600"
            title="Cancel"
        >
            <i class="fas fa-times"></i>
        </button>
        {#if $nicknames[address]}
            <button
                on:click={handleRemoveNickname}
                class="text-gray-500 hover:text-gray-600"
                title="Remove nickname"
            >
                <i class="fas fa-trash"></i>
            </button>
        {/if}
    </div>
{:else if $nicknames[address]}
    <span class="text-gray-600 dark:text-gray-400">({$nicknames[address]})</span>
{/if} 