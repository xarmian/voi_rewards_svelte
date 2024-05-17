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

	let searchText = '';
	/**
	 * @type {string | any[]}
	 */
	let addressList: string[] = [];
	let selectedAddressIndex = -1;
	let windowDefined = false;
    let componentElement: any;
    export let onSubmit: (addr: string) => void;
    export let loadPreviousValue: boolean = true;
    $: isMobile = false;


	onMount(() => {
        windowDefined = typeof window !== 'undefined';
        if (windowDefined) {
            window.addEventListener('keydown', handleKeydown);
            document.addEventListener('click', handleClickOutside);

            // Read searchText from local storage
            if (loadPreviousValue) {
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
        
        if (searchText && searchText.length > 0) {
            localStorage.setItem('searchText', searchText);
        }

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

        onSubmit(addr??searchText);
        addressList = [];
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
</script>

<div class="mx-auto sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl relative" bind:this={componentElement}>
    <div
        class="dark:bg-gray-800 bg-white flex"
    >
        <input
            type="text"
            use:init
            bind:value={searchText}
            on:input={(event) => handleInput()}
            class="dark:bg-gray-700 bg-gray-100 flex-grow"
            placeholder="Select wallet by Address or NFD"
        />
        <button on:click={() => handleSubmit(undefined)} class="dark:bg-blue-500 bg-blue-300 p-2">
        {#if !isMobile}
            Submit
        {:else}
            <SearchOutline />
        {/if}
        </button>
    </div>

    {#if addressList.length > 0}
    <div class="absolute z-50">
        <div class="bg-white dark:bg-gray-800 overflow-hidden max-h-64">
            <ul class="inline-block text-left">
                {#each addressList as address, index}
                    <li>
                        <button class="p-1 border border-solid text-left w-screen md:w-full lg:w-full text-lg"
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
