<script lang="ts">
	/*
        A Svelte component containing an input field and submit button.

        When text is entered into the input field, if the text contains a period, a search is performed to look for an NFDomain. If an NFDomain match is found, a listing of unverified addresses attached to that NFDomain is shown below the input box as an “autocomplete”, and a user is able to select one of the addresses.

        IF the user selects one of the addresses from the NFDomain, enters a full wallet address and presses enter, or clicks the submit button THEN open the page /wallet/[ADDRESS] where [ADDRESS] is the selected address in the input component.

        Things to utilize:
        Tailwind for styling

        Requirements:
        Both light and dark mode compatible
    */

	import { getAddressesForNFD } from '$lib/utils/nfd';
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
	let addressList: string[] = [];
	let selectedAddressIndex = -1;
	let windowDefined = false;
    let componentElement: any;
    export let onSubmit: (addr: string) => void;
    export let loadPreviousValue: boolean = true;
    export let storeAddress: boolean = false;
    export let clearOnSubmit: boolean = false;
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
		// Implement logic to search NFDomain and update addressList
        const storedSearchText = localStorage.getItem('searchText');

        if (searchText.length == 0 && storedSearchText) {
            if (storedSearchText.includes('.algo')) {
                getAddressesForNFD(storedSearchText).then((data) => {
                    addressList = data;
                });
            }
            else if (storedSearchText.length == 58) {
                addressList = [storedSearchText];
            }
        }
		else if (searchText.includes('.algo')) {
			getAddressesForNFD(searchText).then((data) => {
				addressList = data;
			});
		}
        else {
            addressList = [];
        }
	}

	// Function to handle address selection or submit
	function handleSubmit(addr?: string) {
        /*if (loadPreviousValue) {
            localStorage.setItem('searchText', searchText);
        }*/
        
        if (selectedAddressIndex >= 0) {
            addr = addressList[selectedAddressIndex];
        }

        if (!addr && searchText.length != 58) {
            if (addressList.length == 0) {
                toast.push('Invalid address');
            }
            else {
                toast.push('Please select an address');
            }
            return;
        }
        else if (storeAddress) {
            if (addr) {
                localStorage.setItem('searchText', addr);
            }
            else if (searchText && searchText.length > 0) {
                localStorage.setItem('searchText', searchText);
            }
        }

        onSubmit(addr??searchText);
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
</script>

<div class="mx-auto sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl relative" bind:this={componentElement}>
    <div class="dark:bg-gray-800 bg-white flex items-center rounded-lg relative">
        <input
            type="text"
            use:init
            bind:value={searchText}
            on:input={(event) => handleInput()}
            class="dark:bg-gray-700 bg-gray-100 flex-grow rounded-l-lg p-2 pr-8 text-black dark:text-white"
            placeholder="Select wallet by Address or NFD"
        />
        {#if searchText}
            <button
                class="absolute inset-y-0 right-16 pl-2 pr-4 flex items-center cursor-pointer"
                on:click={clearSearchText}
            >
                <svg class="h-6 w-6 text-gray-500 dark:text-gray-100" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        {/if}
        <button on:click={() => handleSubmit(undefined)} class="bg-[#6F2AE2] border border-bg-[#6F2AE2] text-white p-2 rounded-r-lg">
        {#if !isMobile}
            Submit
        {:else}
            <SearchOutline />
        {/if}
        </button>
    </div>

    {#if addressList.length > 0 && searchText.length > 0}
    <div class="absolute z-50 mt-2 w-full">
        <div class="bg-white dark:bg-gray-800 overflow-hidden max-h-64 rounded-lg shadow-lg">
            <ul class="inline-block text-left">
                {#each addressList as address, index}
                    <li>
                        <button class="p-1 border border-solid text-left w-full text-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                            class:selected={index === selectedAddressIndex}
                            on:click={() => {
                                handleSubmit(address);
                            }}>{address}</button
                        >
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
        z-index:1;
    }

    li {
        @apply border-b border-gray-200 dark:border-gray-700;
    }

    button {
        @apply text-gray-900 dark:text-white;
    }

    .selected {
        @apply bg-gray-300 dark:bg-gray-700;
    }
</style>