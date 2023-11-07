<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
    import WalletView from '../../../../views/WalletView.svelte';

    export let data: PageData;
    let walletId = data.walletId;
</script>

<div class="float-left text-xl pl-6 cursor-pointer">
    <a on:click={() => goto('/')} class="text-blue-500 hover:text-blue-800">&#8592; Home</a>
</div>

<WalletView isModal={false} walletId={walletId}></WalletView>