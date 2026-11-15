<script lang="ts">
	import { setContext } from 'svelte';
	import type { ConnectedAccount } from 'avm-wallet-svelte';
	import AccountSelector from '../../../node_modules/avm-wallet-svelte/dist/components/AccountSelector.svelte';
	import { SCOPE_CONTEXT_KEY } from '../../../node_modules/avm-wallet-svelte/dist/state/scope.svelte.js';
	let {
		accounts,
		currentAccount = null
	}: {
		accounts: ConnectedAccount[];
		currentAccount?: Pick<ConnectedAccount, 'address' | 'walletId'> | null;
	} = $props();
	setContext(SCOPE_CONTEXT_KEY, {
		walletStore: {
			get accounts() {
				return accounts;
			},
			get selectedAccount() {
				return accounts[0];
			}
		},
		uiStore: {},
		registry: { getWalletInfo: () => [] }
	});
</script>

<section aria-label="Your accounts">
	<AccountSelector accountMode="navigation" {currentAccount} />
</section>
