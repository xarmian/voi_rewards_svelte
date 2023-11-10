<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { onMount, onDestroy } from 'svelte';

	let searchText = '';
	/**
	 * @type {string | any[]}
	 */
	let addressList: string[] = [];
	let selectedAddressIndex = -1;
	let windowDefined = false;
    let componentElement: any;

	// Function to handle text input changes
	/**
	 * @param {{ target: { value: string; }; }} event
	 */
	function handleInput() {
		// Implement logic to search NFDomain and update addressList
		if (searchText.includes('.algo')) {
			getAddressesForNFD(searchText).then((data) => {
				addressList = data;
			});
		}
	}

	// Function to handle address selection or submit
	function handleSubmit() {
		// Navigate to /wallet/<searchText>
		goto(`/wallet/${searchText}`);
	}

	onMount(() => {
		windowDefined = typeof window !== 'undefined';
		if (windowDefined) {
			// You can safely use window here
			window.addEventListener('keydown', handleKeydown);
            document.addEventListener('click', handleClickOutside);
		}
	});

	onDestroy(() => {
		if (windowDefined) {
			window.removeEventListener('keydown', handleKeydown);
            document.removeEventListener('click', handleClickOutside);
		}
	});

    function handleClickOutside(event: MouseEvent) {
        console.log(componentElement);
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
            searchText = addressList[selectedAddressIndex];
            handleSubmit();
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
        <button on:click={handleSubmit} class="dark:bg-blue-500 bg-blue-300 p-2"> Submit </button>
    </div>

    {#if addressList.length > 0}
    <div class="absolute">
        <div class="bg-white dark:bg-gray-800 overflow-hidden max-h-64">
            <ul class="inline-block text-left">
                {#each addressList as address, index}
                    <li>
                        <button class="p-1 border border-solid text-left w-screen md:w-full lg:w-full"
                            class:selected={index === selectedAddressIndex}
                            on:click={() => {
                                searchText = address;
                                handleSubmit();
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
