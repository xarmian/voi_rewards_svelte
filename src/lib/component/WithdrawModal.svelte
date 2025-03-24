<script lang="ts">
    import type { ContractDetails } from '$lib/types';
    import { formatNumber, microVOIToVOI, VOIToMicroVOI } from '$lib/utils/format';
    import { abi, CONTRACT } from 'ulujs';
    import { selectedWallet, signAndSendTransactions } from 'avm-wallet-svelte';
    import algosdk from 'algosdk';
    import { algodClient } from '$lib/utils/algod';

    export let contract: ContractDetails;
    export let show = false;
    export let onSuccess: (forceRefresh?: boolean) => void;
    
    let withdrawAmountVOI: number | null = null;
    let error: string | null = null;
    let isLoading = false;
    let txStatus: 'idle' | 'building' | 'signing' | 'confirming' | 'confirmed' | 'error' = 'idle';
    let txId: string | null = null;

    // Convert microVOI to VOI for display
    $: availableBalanceVOI = microVOIToVOI(contract.availableForWithdrawal);
    $: currentBalanceVOI = microVOIToVOI(contract.balance);
    $: lockedBalanceVOI = microVOIToVOI(contract.lockedBalance);
    $: explorerUrl = txId ? `https://explorer.voi.network/explorer/transaction/${txId}` : null;

    function setMaxAmount() {
        withdrawAmountVOI = availableBalanceVOI;
    }

    function handleClose() {
        if (txStatus !== 'building' && txStatus !== 'signing' && txStatus !== 'confirming') {
            show = false;
            // Only trigger refresh on successful withdrawal
            if (txStatus === 'confirmed') {
                onSuccess?.(true);
            } else {
                onSuccess?.(false);
            }
            // Reset state
            txStatus = 'idle';
            txId = null;
            error = null;
            withdrawAmountVOI = null;
        }
    }

    async function handleWithdraw() {
        if (withdrawAmountVOI === null || withdrawAmountVOI <= 0) {
            error = 'Please enter a valid amount';
            return;
        }

        if (withdrawAmountVOI > availableBalanceVOI) {
            error = 'Amount exceeds available balance';
            return;
        }

        if (!contract.owner || !contract.contractId) {
            error = 'Missing parent wallet address or contract ID';
            return;
        }

        isLoading = true;
        error = null;
        txStatus = 'building';

        try {
            // Convert VOI to microVOI for the actual withdrawal
            const withdrawAmountMicroVOI = VOIToMicroVOI(withdrawAmountVOI ?? 0);

            const ctcInfo = Number(contract.contractId);

            const schema = {
                name: "Withdraw",
                desc: "Withdraw from the contract",
                methods: [
                    {
                        "name": "withdraw",
                        "args": [
                        {
                            "type": "uint64",
                            "name": "amount"
                        }
                        ],
                        "readonly": false,
                        "returns": {
                            "type": "uint64"
                        }
                    },
                ],
                events: [],
            };

            const builder = {
                wnt: new CONTRACT(
                ctcInfo,
                algodClient,
                null,
                schema,
                {
                    addr: contract.owner,
                    sk: new Uint8Array(0),
                },
                true,
                false,
                true
                ),
            };

            const ci = new CONTRACT(ctcInfo, algodClient, null, abi.custom, {
                addr: contract.owner,
                sk: new Uint8Array(0),
            });

            const txnO = {
                ...(
                await builder.wnt.withdraw(
                    withdrawAmountMicroVOI
                )
                ).obj,
                payment: 2000,
            };

            ci.setFee(2000);
            ci.setEnableGroupResourceSharing(true);
            ci.setExtraTxns([txnO]);
            const customR = await ci.custom();

            const txns: algosdk.Transaction[] = customR.txns.map((txn: string) => algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(txn, 'base64'))));

            txId = txns[1].txID();
            txStatus = 'signing';

            const result = await signAndSendTransactions([txns]);
            if (result) {
                txStatus = 'confirming';
                // Wait for confirmation
                try {
                    await algodClient.pendingTransactionInformation(txId).do();
                    txStatus = 'confirmed';
                } catch (err) {
                    console.error('Error confirming transaction:', err);
                    txStatus = 'error';
                    error = 'Transaction failed to confirm';
                }
            } else {
                txStatus = 'error';
                error = 'Failed to process withdrawal';
            }
        } catch (err) {
            txStatus = 'error';
            error = 'Failed to process withdrawal';
            console.error('Withdrawal error:', err);
        } finally {
            isLoading = false;
        }
    }

    $: formattedWithdrawAmount = withdrawAmountVOI ? withdrawAmountVOI.toFixed(2) : '0.00';
</script>

{#if show}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    Withdraw VOI
                </h3>
            </div>

            <!-- Content -->
            <div class="px-6 py-4 space-y-4">
                {#if txStatus === 'confirmed'}
                    <div class="text-center space-y-4">
                        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900">
                            <i class="fas fa-check text-green-600 dark:text-green-400 text-xl"></i>
                        </div>
                        <div class="text-center">
                            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Withdrawal Successful</h3>
                            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                Your withdrawal of {formattedWithdrawAmount} VOI has been confirmed.
                            </p>
                            {#if explorerUrl}
                                <a
                                    href={explorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="mt-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
                                >
                                    View on Explorer
                                    <i class="fas fa-external-link-alt ml-2"></i>
                                </a>
                            {/if}
                        </div>
                    </div>
                {:else if txStatus === 'error'}
                    <div class="text-center space-y-4">
                        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900">
                            <i class="fas fa-exclamation-triangle text-red-600 dark:text-red-400 text-xl"></i>
                        </div>
                        <div class="text-center">
                            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Transaction Failed</h3>
                            <p class="mt-2 text-sm text-red-600 dark:text-red-400">
                                {error || 'An error occurred while processing your withdrawal.'}
                            </p>
                        </div>
                    </div>
                {:else}
                    <!-- Transaction Status -->
                    {#if txStatus !== 'idle'}
                        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                            <div class="flex items-center space-x-3">
                                <div class="flex-shrink-0">
                                    {#if txStatus === 'building'}
                                        <i class="fas fa-cog animate-spin text-blue-500"></i>
                                    {:else if txStatus === 'signing'}
                                        <i class="fas fa-pen animate-pulse text-blue-500"></i>
                                    {:else if txStatus === 'confirming'}
                                        <i class="fas fa-clock animate-pulse text-blue-500"></i>
                                    {/if}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                                        {#if txStatus === 'building'}
                                            Building Transaction
                                        {:else if txStatus === 'signing'}
                                            Waiting for Signature
                                        {:else if txStatus === 'confirming'}
                                            Confirming Transaction
                                        {/if}
                                    </p>
                                </div>
                            </div>
                        </div>
                    {/if}

                    <!-- Contract Info -->
                    <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Contract ID</span>
                            <span class="font-medium text-gray-900 dark:text-white">{contract.contractId}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Current Balance</span>
                            <span class="font-medium text-gray-900 dark:text-white">{currentBalanceVOI.toLocaleString()} VOI</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Locked Balance</span>
                            <span class="font-medium text-gray-900 dark:text-white">{lockedBalanceVOI.toLocaleString()} VOI</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Available Balance</span>
                            <span class="font-medium text-gray-900 dark:text-white">{availableBalanceVOI.toLocaleString()} VOI</span>
                        </div>
                    </div>

                    <!-- Amount Input -->
                    <div class="space-y-2">
                        <label for="amount" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Withdrawal Amount (VOI)
                        </label>
                        <div class="relative rounded-md shadow-sm">
                            <input
                                type="number"
                                id="amount"
                                bind:value={withdrawAmountVOI}
                                min="0"
                                max={availableBalanceVOI}
                                step="0.000001"
                                class="block w-full pr-20 border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                                placeholder="0.00"
                                disabled={txStatus !== 'idle'}
                            />
                            <div class="absolute inset-y-0 right-0 flex items-center">
                                <button
                                    type="button"
                                    on:click={setMaxAmount}
                                    class="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                                    disabled={txStatus !== 'idle'}
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {formattedWithdrawAmount} VOI
                        </p>
                    </div>

                    {#if error}
                        <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
                    {/if}
                {/if}
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end space-x-3">
                <button
                    type="button"
                    on:click={handleClose}
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md"
                    disabled={txStatus === 'building' || txStatus === 'signing' || txStatus === 'confirming'}
                >
                    {txStatus === 'confirmed' || txStatus === 'error' ? 'Close' : 'Cancel'}
                </button>
                {#if txStatus === 'idle'}
                    <button
                        type="button"
                        on:click={handleWithdraw}
                        disabled={isLoading || withdrawAmountVOI === null || withdrawAmountVOI <= 0 || withdrawAmountVOI > availableBalanceVOI}
                        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {#if isLoading}
                            <i class="fas fa-spinner animate-spin mr-2"></i>
                        {/if}
                        Withdraw
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if} 