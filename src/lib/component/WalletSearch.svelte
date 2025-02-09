<script lang="ts">
	/*
        A Svelte component containing an input field and submit button.

        When text is entered into the input field, if the text contains a period, a search is performed to look for an NFDomain. If an NFDomain match is found, a listing of unverified addresses attached to that NFDomain is shown below the input box as an "autocomplete", and a user is able to select one of the addresses.

        IF the user selects one of the addresses from the NFDomain, enters a full wallet address and presses enter, or clicks the submit button THEN open the page /wallet/[ADDRESS] where [ADDRESS] is the selected address in the input component.

        Things to utilize:
        Tailwind for styling

        Requirements:
        Both light and dark mode compatible
    */

	import { getEnvoiAddresses, searchEnvoi, type EnvoiSearchResult } from '$lib/utils/envoi';
	import { toast } from '@zerodevx/svelte-toast';
	import { onMount, onDestroy } from 'svelte';
    import { SearchOutline } from 'flowbite-svelte-icons';
    //@ts-ignore
    import Device from 'svelte-device-info';
	import { get } from 'svelte/store';

	export let searchText = '';
	/**
	 * @type {string | any[]}
	 */
	let addressList: EnvoiSearchResult[] = [];
	let selectedAddressIndex = -1;
	let windowDefined = false;
    let componentElement: any;
    export let onSubmit: (addr: string) => void;
    export let loadPreviousValue: boolean = true;
    export let storeAddress: boolean = false;
    export let clearOnSubmit: boolean = false;
    export let hideSubmitButton: boolean = false;
    $: isMobile = false;


	onMount(() => {
        windowDefined = typeof window !== 'undefined';
        if (windowDefined) {
            window.addEventListener('keydown', handleKeydown);
            document.addEventListener('click', handleClickOutside);

            // Read searchText from local storage
            if (loadPreviousValue && searchText == '') {
                const storedSearchText = localStorage.getItem('searchText');
                if (storedSearchText) {
                    searchText = storedSearchText;
                }
            }
        }
        isMobile = Device.isMobile;

	});

	onDestroy(() => {
		if (windowDefined) {
			window.removeEventListener('keydown', handleKeydown);
            document.removeEventListener('click', handleClickOutside);
		}
	});

	// Function to handle text input changes
	function handleInput() {
        if (searchText.length === 0) {
            addressList = [];
            return;
        }
        else if (searchText.length == 58) {
            handleSubmit();
            return;
        }
        
        // Search as user types
        searchEnvoi(searchText).then((results) => {
            addressList = results;
        });
	}

	// Function to handle address selection or submit
	function handleSubmit(result?: EnvoiSearchResult) {
        if (selectedAddressIndex >= 0) {
            result = addressList[selectedAddressIndex];
        }

        const addr = result?.address ?? searchText;

        if (!result && searchText.length != 58) {
            if (addressList.length == 0) {
                toast.push('Invalid address');
            }
            else {
                toast.push('Please select an address');
            }
            return;
        }
        else if (storeAddress) {
            localStorage.setItem('searchText', addr);
        }

        if (result) {
            searchText = result.name;
        }

        onSubmit(addr);
        addressList = [];
        if (clearOnSubmit) {
            searchText = '';
        }
	}

    function handleClickOutside(event: MouseEvent) {
        if (!componentElement.contains(event.target)) {
            addressList = [];
        }
        else {
            handleInput();
        }
    }

  function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            addressList = [];
            selectedAddressIndex = -1;
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            if (searchText && addressList.length === 0) {
                handleInput();
            } else {
                selectedAddressIndex = event.key === 'ArrowUp'
                    ? Math.max(0, selectedAddressIndex - 1)
                    : Math.min(addressList.length - 1, selectedAddressIndex + 1);
            }
            event.preventDefault();
        } else if (event.key === 'Enter' && selectedAddressIndex >= 0) {
            //searchText = addressList[selectedAddressIndex];
            handleSubmit(addressList[selectedAddressIndex]);
            event.preventDefault();
        }
        else if (searchText.length == 58) {
            handleSubmit();
            event.preventDefault();
        }
    }

    function init(el: any) {
        el.focus();
    }

    function clearSearchText() {
        searchText = '';
        addressList = [];
        localStorage.removeItem('searchText');
        selectedAddressIndex = -1;
        return;
    }
</script>

<div class="relative" bind:this={componentElement}>
    <div class="dark:bg-gray-800 bg-white flex items-center rounded-lg relative">
        <input
            type="text"
            use:init
            bind:value={searchText}
            on:input={handleInput}
            class="dark:bg-gray-700 bg-gray-100 flex-grow p-2 pr-8 text-black dark:text-white {hideSubmitButton ? 'rounded-lg' : 'rounded-l-lg'}"
            placeholder="Search by enVoi name or address"
        />
        {#if searchText}
            <button
                class="absolute inset-y-0 {hideSubmitButton ? 'right-0' : 'right-16'} pl-2 pr-4 flex items-center cursor-pointer"
                on:click={clearSearchText}
                aria-label="Clear search"
            >
                <svg class="h-6 w-6 text-gray-500 dark:text-gray-100" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        {/if}
        {#if !hideSubmitButton}
            <button on:click={() => handleSubmit()} class="bg-[#6F2AE2] border border-bg-[#6F2AE2] text-white p-2 rounded-r-lg">
            {#if !isMobile}
                Submit
            {:else}
                <SearchOutline />
            {/if}
            </button>
        {/if}
    </div>

    {#if addressList.length > 0 && searchText.length > 0}
    <div class="absolute z-50 mt-2 w-full">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-h-64 border border-gray-200 dark:border-gray-700">
            <ul class="overflow-y-auto max-h-64 w-full">
                {#each addressList as result, index}
                    <li>
                        <button class="p-2 border border-solid text-left w-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                            class:selected={index === selectedAddressIndex}
                            on:click={() => handleSubmit(result)}>
                            <div class="flex items-center gap-3">
                                {#if result.metadata?.avatar}
                                    <img 
                                        src={result.metadata.avatar} 
                                        alt={`${result.name} avatar`}
                                        class="w-8 h-8 rounded-full object-cover object-center flex-shrink-0"
                                    />
                                {:else}
                                    <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                                        <span class="text-gray-600 dark:text-gray-300 text-sm w-8 h-8 flex items-center justify-center">
                                            {result.name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                {/if}
                                <div class="flex flex-col">
                                    <span class="text-lg font-medium truncate">{result.name}</span>
                                    <span class="text-sm text-gray-500 dark:text-gray-400 font-mono truncate">{result.address}</span>
                                </div>
                            </div>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    </div>
    {/if}
</div>
<style lang="postcss">
    ul {
        @apply bg-white dark:bg-gray-800;
        scrollbar-width: thin;
        scrollbar-color: theme('colors.gray.400') theme('colors.gray.200');
    }

    ul::-webkit-scrollbar {
        width: 8px;
    }

    ul::-webkit-scrollbar-track {
        @apply bg-gray-200 dark:bg-gray-700 rounded-r-lg;
    }

    ul::-webkit-scrollbar-thumb {
        @apply bg-gray-400 dark:bg-gray-500 rounded-full;
    }

    li {
        @apply border-b border-gray-200 dark:border-gray-700;
    }

    li:last-child {
        @apply border-b-0;
    }

    button {
        @apply text-gray-900 dark:text-white;
    }

    .selected {
        @apply bg-gray-300 dark:bg-gray-700;
    }
</style>