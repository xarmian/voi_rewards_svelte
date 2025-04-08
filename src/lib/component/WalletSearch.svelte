<script lang="ts">
	import { getEnvoiAddresses, searchEnvoi, type EnvoiSearchResult, getEnvoiNames } from '$lib/utils/envoi';
	import { toast } from '@zerodevx/svelte-toast';
	import { onMount, onDestroy } from 'svelte';
    import { SearchOutline } from 'flowbite-svelte-icons';
    import { debounce } from 'lodash-es';
    import { connectedWallets } from 'avm-wallet-svelte';

	export let searchText = '';
	let addressList: EnvoiSearchResult[] = [];
	let selectedAddressIndex = -1;
	let windowDefined = false;
    let componentElement: any;
    let dropdownList: HTMLUListElement;
    let isInputFocused = false;
    export let onSubmit: (address: string, index?: number) => void;
    export let loadPreviousValue: boolean = true;
    export let storeAddress: boolean = true;
    export let clearOnSubmit: boolean = true;
    export let hideSubmitButton: boolean = false;

	onMount(() => {
        windowDefined = typeof window !== 'undefined';
        if (windowDefined) {
            document.addEventListener('click', handleClickOutside);

            // Read searchText from local storage
            if (loadPreviousValue && searchText == '') {
                const storedSearchText = localStorage.getItem('searchText');
                if (storedSearchText) {
                    searchText = storedSearchText;
                }
            }
        }
	});

	onDestroy(() => {
		if (windowDefined) {
            document.removeEventListener('click', handleClickOutside);
		}
	});

	// Create debounced search function
	const debouncedSearch = debounce(async (query: string) => {
		if (query.length === 0) {
			addressList = [];
			return;
		}
		const results = await searchEnvoi(query);
		addressList = results;
	}, 300);

	// Function to handle text input changes
	function handleInput() {
		if (searchText.length === 58) {
			handleSubmit();
			return;
		}
        if (searchText.length === 0) {
            onSubmit('');

            if ($connectedWallets.length > 0 && isInputFocused) {
                populateConnectedWallets();
            } else {
                addressList = [];
            }
            selectedAddressIndex = -1;
            return;
        }
		debouncedSearch(searchText);
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

        onSubmit(addr, selectedAddressIndex);
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

    function populateConnectedWallets() {
        // Create a set of unique addresses from connected wallets
        const wallets = [...new Set($connectedWallets.map(wallet => wallet.address))];
        
        // Initialize addressList with truncated addresses as fallback names
        addressList = wallets.map((address) => ({
            address,
            name: $connectedWallets.find(w => w.address === address)?.envoiName || 
                  address.slice(0, 8) + '...' + address.slice(-8),
            metadata: {},
            cached: true
        })).sort((a, b) => a.name.localeCompare(b.name));
        
        // Fetch and populate Envoi names and avatars
        getEnvoiNames(wallets).then(names => {
            addressList = addressList.map(item => {
                const envoiData = names.find(name => name.address === item.address);
                if (envoiData) {
                    return {
                        ...item,
                        name: envoiData.name,
                        metadata: envoiData.metadata
                    };
                }
                return item;
            });
        });
    }

    function handleKeydown(event: KeyboardEvent) {
        // Only prevent default for navigation keys
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
            event.preventDefault();
        }

        if (event.key === 'ArrowDown' && addressList.length === 0 && searchText.length === 0 && $connectedWallets.length > 0) {
            populateConnectedWallets();
            selectedAddressIndex = 0;
            return;
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            if (addressList.length > 0) {
                if (selectedAddressIndex === -1) {
                    selectedAddressIndex = event.key === 'ArrowUp' ? addressList.length - 1 : 0;
                } else {
                    selectedAddressIndex = event.key === 'ArrowUp'
                        ? (selectedAddressIndex - 1 + addressList.length) % addressList.length
                        : (selectedAddressIndex + 1) % addressList.length;
                }
            }
        } else if (event.key === 'Enter') {
            if (selectedAddressIndex >= 0 && addressList.length > 0) {
                handleSubmit(addressList[selectedAddressIndex]);
            } else if (addressList.length > 0) {
                selectedAddressIndex = 0;
                handleSubmit(addressList[selectedAddressIndex]);
            } else {
                handleSubmit();
            }
        } else if (event.key === 'Escape') {
            addressList = [];
            selectedAddressIndex = -1;
            event.preventDefault();
            event.stopPropagation();
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
        onSubmit('');
        return;
    }

    $: if (selectedAddressIndex >= 0 && dropdownList) {
        const selectedItem = dropdownList.children[selectedAddressIndex] as HTMLElement;
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
</script>

<div class="relative" bind:this={componentElement}>
    <div class="dark:bg-gray-800 bg-white flex items-center rounded-lg relative">
        <input
            type="text"
            use:init
            bind:value={searchText}
            on:input={handleInput}
            on:keydown={handleKeydown}
            on:click={() => {
                isInputFocused = true;
                if (searchText.length === 0 && $connectedWallets.length > 0) {
                    handleInput();
                }
            }}
            on:blur={() => {
                isInputFocused = false;
            }}
            class="dark:bg-gray-700 bg-gray-100 flex-grow p-2 pr-8 text-black dark:text-white {hideSubmitButton ? 'rounded-lg' : 'rounded-l-lg'}"
            placeholder="Search by enVoi name or address"
            autocomplete="off"
            role="combobox"
            aria-expanded={addressList.length > 0}
            aria-controls="search-listbox"
            aria-activedescendant={selectedAddressIndex >= 0 ? `option-${selectedAddressIndex}` : undefined}
        />
        {#if searchText}
            <button
                class="absolute inset-y-0 {hideSubmitButton ? 'right-2' : 'right-16'} pr-0 flex items-center cursor-pointer"
                on:click={clearSearchText}
                aria-label="Clear search"
            >
                <svg class="h-5 w-5 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        {/if}
        {#if !hideSubmitButton}
            <button on:click={() => handleSubmit()} class="bg-[#6F2AE2] border border-bg-[#6F2AE2] text-white p-2 rounded-r-lg">
                <SearchOutline class="block sm:hidden" />
                <span class="hidden sm:block">Submit</span>
            </button>
        {/if}
    </div>

    {#if addressList.length > 0}
    <div class="fixed z-50" style="top: {componentElement?.getBoundingClientRect().bottom + 8}px; left: {componentElement?.getBoundingClientRect().left}px; width: {componentElement?.getBoundingClientRect().width}px;">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-h-64 border border-gray-200 dark:border-gray-700 w-full">
            <ul id="search-listbox" 
                role="listbox" 
                class="overflow-y-auto max-h-64 w-full"
                bind:this={dropdownList}>
                {#each addressList as result, index}
                    <li>
                        <button 
                            class="p-2 border border-solid text-left w-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white {index === selectedAddressIndex ? 'bg-purple-100 dark:bg-purple-900 ring-2 ring-[#6F2AE2] ring-opacity-50' : ''}"
                            on:click={() => handleSubmit(result)}
                            on:mouseenter={() => selectedAddressIndex = index}
                            role="option"
                            aria-selected={index === selectedAddressIndex}>
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
        @apply bg-white;
        scrollbar-width: thin;
        scrollbar-color: theme('colors.gray.400') theme('colors.gray.200');
    }

    :global(.dark) ul {
        @apply bg-gray-800;
    }

    ul::-webkit-scrollbar {
        width: 8px;
    }

    ul::-webkit-scrollbar-track {
        @apply bg-gray-200 rounded-r-lg;
    }

    :global(.dark) ul::-webkit-scrollbar-track {
        @apply bg-gray-700;
    }

    ul::-webkit-scrollbar-thumb {
        @apply bg-gray-400 rounded-full;
    }

    :global(.dark) ul::-webkit-scrollbar-thumb {
        @apply bg-gray-500;
    }

    li {
        @apply border-b border-gray-200;
    }

    :global(.dark) li {
        @apply border-gray-700;
    }

    li:last-child {
        @apply border-b-0;
    }

    button {
        @apply text-gray-900;
    }

    :global(.dark) button {
        @apply text-white;
    }
</style>