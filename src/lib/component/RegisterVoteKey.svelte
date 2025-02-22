<script lang="ts">
    import { fade } from 'svelte/transition';
    import Modal from './ui/Modal.svelte';
    import { selectedWallet, signAndSendTransactions } from 'avm-wallet-svelte';
    import algosdk from 'algosdk';
    import { algodClient } from '$lib/utils/algod';
    import { abi, CONTRACT } from 'ulujs';
    import VoiSwarmInstructions from './node-instructions/VoiSwarmInstructions.svelte';
    import OneClickInstructions from './node-instructions/OneClickInstructions.svelte';
    import FuncInstructions from './node-instructions/FuncInstructions.svelte';
    import { goto } from '$app/navigation';
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    export let walletAddress: string;
    export let parentWalletAddress: string | null;
    export let contractId: number | null;
    export let showModal = true;
    export let isOnline = false;
    export let onSuccess: (forceRefresh?: boolean) => void;
    
    type NodeType = 'voi-swarm' | 'one-click' | 'func' | 'other';

    let selectedNode: NodeType = 'other';
    let firstRound = '';
    let lastRound = '';
    let keyDilution = '';
    let selectionKey = '';
    let votingKey = '';
    let stateProofKey = '';
    let isLoading = false;
    let error: string | null = null;
    let transactionStatus: 'idle' | 'building' | 'signing' | 'submitting' | 'confirming' | 'success' = 'idle';
    let transactionId: string | null = null;

    interface ParsedKeys {
        parentAddress: string;
        firstRound: number;
        lastRound: number;
        keyDilution: number;
        selectionKey: string;
        votingKey: string;
        stateProofKey: string;
    }

    const nodeInstructions = {
        'voi-swarm': {
            title: 'Voi Swarm Node',
            description: 'Easy-to-use Docker container for running a Voi node'
        },
        'one-click': {
            title: "Aust's One-Click Node",
            description: 'Simple one-click installation for Voi nodes'
        },
        'func': {
            title: 'Funk\'s Ultimate Node Controller (FUNC)',
            description: 'Node with web management interface'
        },
        'other': {
            title: 'Other Node',
            description: 'Manual participation key registration'
        }
    };

    async function parseClipboardContent(text: string): Promise<ParsedKeys | null> {
        try {
            const lines = text.split('\n');
            const result: ParsedKeys = {
                parentAddress: '',
                firstRound: 0,
                lastRound: 0,
                keyDilution: 0,
                selectionKey: '',
                votingKey: '',
                stateProofKey: ''
            };

            for (const line of lines) {
                if (line.includes('Parent address:')) {
                    result.parentAddress = line.split(':')[1].trim();
                } else if (line.includes('First round:')) {
                    result.firstRound = parseInt(line.split(':')[1].trim());
                } else if (line.includes('Last round:')) {
                    result.lastRound = parseInt(line.split(':')[1].trim());
                } else if (line.includes('Key dilution:')) {
                    result.keyDilution = parseInt(line.split(':')[1].trim());
                } else if (line.includes('Selection key:')) {
                    result.selectionKey = line.split(':')[1].trim();
                } else if (line.includes('Voting key:')) {
                    result.votingKey = line.split(':')[1].trim();
                } else if (line.includes('State proof key:')) {
                    result.stateProofKey = line.split(':')[1].trim();
                }
            }

            // Validate that we have all required fields
            if (!result.firstRound || !result.lastRound || !result.keyDilution || 
                !result.selectionKey || !result.votingKey || !result.stateProofKey) {
                throw new Error('Missing required fields in clipboard content');
            }

            return result;
        } catch (err) {
            console.error('Error parsing clipboard content:', err);
            return null;
        }
    }

    async function handlePasteAll() {
        try {
            isLoading = true;
            error = null;
            const text = await navigator.clipboard.readText();
            const parsed = await parseClipboardContent(text);
            
            if (parsed) {
                firstRound = parsed.firstRound.toString();
                lastRound = parsed.lastRound.toString();
                keyDilution = parsed.keyDilution.toString();
                selectionKey = parsed.selectionKey;
                votingKey = parsed.votingKey;
                stateProofKey = parsed.stateProofKey;

                // Validate if the parent address matches
                if (parsed.parentAddress && parsed.parentAddress !== walletAddress) {
                    error = 'Warning: The parent address in the key file does not match your wallet address';
                }
            } else {
                error = 'Invalid clipboard content format';
            }
        } catch (err) {
            error = 'Failed to read clipboard content';
            console.error(err);
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        error = null;
        console.log('Submitting participation key details');

        // check for all required fields
        if (!firstRound || !lastRound || !keyDilution || !selectionKey || !votingKey || !stateProofKey) {
            error = 'Missing required fields';
            return;
        }

        // check if our wallet is a smart contract escrow account or regular account
        if (parentWalletAddress === null) {
            console.log('Account is a regular account');
            registerWalletVoteKey();
        } else {
            console.log('Account is a staking contract');
            registerStakingContractVoteKey();
        }
    }

    async function registerStakingContractVoteKey() {
        console.log('Registering staking contract vote key');

        if (!parentWalletAddress || !contractId) {
            error = 'Missing parent wallet address or contract ID';
            return;
        }

        try {
            transactionStatus = 'building';
            const ctcInfo = Number(contractId);

            const schema = {
                name: "Participate",
                desc: "Participate in the staking contract",
                methods: [
                    {
                        name: "participate",
                        desc: "",
                        args: [
                            { name: "votekey", type: "byte[32]" },
                            { name: "selkey", type: "byte[32]" },
                            { name: "votefst", type: "uint64" },
                            { name: "votelst", type: "uint64" },
                            { name: "votekd", type: "uint64" },
                            { name: "spkey", type: "byte[64]" },
                        ],
                        returns: { type: "void" },
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
                    addr: parentWalletAddress,
                    sk: new Uint8Array(0),
                },
                true,
                false,
                true
                ),
            };

            const ci = new CONTRACT(ctcInfo, algodClient, null, abi.custom, {
                addr: parentWalletAddress,
                sk: new Uint8Array(0),
            });

            const txnO = {
                ...(
                await builder.wnt.participate(
                    new Uint8Array(Buffer.from(votingKey, "base64")),
                    new Uint8Array(Buffer.from(selectionKey, "base64")),
                    Number(firstRound),
                    Number(lastRound),
                    Number(keyDilution),
                    new Uint8Array(Buffer.from(stateProofKey, "base64")),
                )
                ).obj,
                payment: 1000,
            };

            ci.setFee(1000);
            ci.setEnableGroupResourceSharing(true);
            ci.setExtraTxns([txnO]);
            const customR = await ci.custom();

            transactionStatus = 'signing';
            const txns: algosdk.Transaction[] = customR.txns.map((txn: string) => algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(txn, 'base64'))));

            const txid = txns[1].txID();

            transactionStatus = 'submitting';
            
            const result = await signAndSendTransactions([txns]);
            if (result) {
                transactionStatus = 'success';
                transactionId = txid;
                onSuccess?.(true);
            }
            else {
                error = 'Failed to register vote key';
                transactionStatus = 'idle';
            }
        } catch (err) {
            console.error('Error registering vote key:', err);
            error = err instanceof Error ? err.message : 'Failed to register vote key';
            transactionStatus = 'idle';
        }
    }

    async function registerWalletVoteKey() {
        try {
            transactionStatus = 'building';
            const params = await algodClient.getTransactionParams().do();
            params.fee = 1000;

            const tx = algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
                from: walletAddress,
                voteKey: Buffer.from(votingKey, 'base64'),
                selectionKey: Buffer.from(selectionKey, 'base64'),
                stateProofKey: Buffer.from(stateProofKey, 'base64'),
                voteFirst: Number(firstRound),
                voteLast: Number(lastRound),
                voteKeyDilution: Number(keyDilution),
                suggestedParams: params
            });

            const txid = tx.txID();

            transactionStatus = 'signing';
            const signedTxns = await signAndSendTransactions([[tx]]);
            
            if (signedTxns && Array.isArray(signedTxns) && signedTxns.length > 0) {
                transactionId = txid;
                transactionStatus = 'confirming';
                await algosdk.waitForConfirmation(algodClient, signedTxns[0], 4);
                transactionStatus = 'success';
                onSuccess?.(true);
            }
        } catch (err) {
            console.error('Error registering vote key:', err);
            error = err instanceof Error ? err.message : 'Failed to register vote key';
            transactionStatus = 'idle';
        }
    }

    async function goOfflineWalletVoteKey() {
        error = null;
        try {
            transactionStatus = 'building';
            const params = await algodClient.getTransactionParams().do();
            params.fee = 1000;

            // For going offline, we use a key registration transaction with nonParticipation set to true
            const tx = algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
                from: walletAddress,
                nonParticipation: true,
                suggestedParams: params
            });

            const txid = tx.txID();

            transactionStatus = 'signing';
            const signedTxns = await signAndSendTransactions([[tx]]);
            
            if (signedTxns && Array.isArray(signedTxns) && signedTxns.length > 0) {
                transactionId = txid;
                transactionStatus = 'confirming';
                await algosdk.waitForConfirmation(algodClient, signedTxns[0], 4);
                transactionStatus = 'success';
                onSuccess?.(true);
            }
        } catch (err) {
            console.error('Error going offline:', err);
            error = err instanceof Error ? err.message : 'Failed to go offline';
            transactionStatus = 'idle';
        }
    }

    async function goOfflineStakingContractVoteKey() {
        error = null;
        console.log('Going offline for staking contract');

        if (!parentWalletAddress || !contractId) {
            error = 'Missing parent wallet address or contract ID';
            return;
        }

        try {
            transactionStatus = 'building';
            const ctcInfo = Number(contractId);

            const schema = {
                name: "Participate",
                desc: "Participate in the staking contract",
                methods: [
                    {
                        name: "participate",
                        desc: "",
                        args: [
                            { name: "votekey", type: "byte[32]" },
                            { name: "selkey", type: "byte[32]" },
                            { name: "votefst", type: "uint64" },
                            { name: "votelst", type: "uint64" },
                            { name: "votekd", type: "uint64" },
                            { name: "spkey", type: "byte[64]" },
                        ],
                        returns: { type: "void" },
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
                    addr: parentWalletAddress,
                    sk: new Uint8Array(0),
                },
                true,
                false,
                true
                ),
            };

            const ci = new CONTRACT(ctcInfo, algodClient, null, abi.custom, {
                addr: parentWalletAddress,
                sk: new Uint8Array(0),
            });

            const txnO = {
                ...(
                await builder.wnt.participate(
                    new Uint8Array(32),  // Empty voting key
                    new Uint8Array(32),  // Empty selection key
                    0,                   // First round
                    0,                   // Last round
                    0,                   // Key dilution
                    new Uint8Array(64),  // Empty state proof key
                )
                ).obj,
                payment: 1000,
            };

            ci.setFee(1000);
            ci.setEnableGroupResourceSharing(true);
            ci.setExtraTxns([txnO]);
            const customR = await ci.custom();

            transactionStatus = 'signing';
            const txns: algosdk.Transaction[] = customR.txns.map((txn: string) => algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(txn, 'base64'))));

            const txid = txns[1].txID();

            transactionStatus = 'submitting';
            
            const result = await signAndSendTransactions([txns]);
            if (result) {
                transactionStatus = 'success';
                transactionId = txid;
                onSuccess?.(true);
            }
            else {
                error = 'Failed to go offline';
                transactionStatus = 'idle';
            }
        } catch (err) {
            console.error('Error going offline:', err);
            error = err instanceof Error ? err.message : 'Failed to go offline';
            transactionStatus = 'idle';
        }
    }

    function formatWalletAddress(address: string): string {
        if (address.length <= 8) return address;
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    function handleGenerateKey() {
        handlePasteAll();
    }
</script>

<Modal bind:showModal size="xl">
    <div slot="header" class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
            <i class="fas fa-key text-blue-500"></i>
            <span class="text-lg font-semibold text-gray-900 dark:text-white">Register Participation Key</span>
        </div>
        <div class="flex items-center gap-2">
            <button
                on:click={handlePasteAll}
                class="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors flex items-center gap-2"
                disabled={isLoading}
            >
                {#if isLoading}
                    <i class="fas fa-spinner fa-spin"></i>
                {:else}
                    <i class="fas fa-clipboard"></i>
                {/if}
                <span>Paste All from Clipboard</span>
            </button>
            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <i class="fas fa-wallet"></i>
                <span class="hidden sm:inline">Wallet:</span>
                <span class="font-mono">{formatWalletAddress(walletAddress)}</span>
            </div>
        </div>
    </div>

    {#if error}
        <div class="mb-6 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm flex items-center gap-2">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{error}</span>
        </div>
    {/if}

    <div class="space-y-8">
        <!-- Node Selection and Instructions -->
        <div class="space-y-6">
            <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 class="text-base font-medium text-gray-900 dark:text-white mb-4">
                    Need help generating keys? Select your node type:
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {#each Object.entries(nodeInstructions) as [type, info]}
                        <button
                            class="p-4 rounded-lg border-2 text-left transition-all {selectedNode === type ? 
                                'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20' : 
                                'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
                            on:click={() => selectedNode = type as NodeType}
                        >
                            <h3 class="font-medium text-gray-900 dark:text-white">{info.title}</h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{info.description}</p>
                        </button>
                    {/each}
                </div>
            </div>

            {#if selectedNode === 'voi-swarm'}
                <VoiSwarmInstructions {walletAddress} />
            {:else if selectedNode === 'one-click'}
                <OneClickInstructions {walletAddress} {parentWalletAddress} />
            {:else if selectedNode === 'func'}
                <FuncInstructions {walletAddress} />
            {/if}
        </div>

        <!-- Registration Form Panel -->
        <div class="space-y-6">
            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                <i class="fas fa-info-circle text-blue-500"></i>
                <span>After generating your participation keys using the instructions, enter them below to register.</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="relative">
                    <label for="firstRound" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        First Round
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
                    </label>
                    <div class="relative">
                        <i class="fas fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"></i>
                        <input
                            type="text"
                            id="firstRound"
                            bind:value={firstRound}
                            class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                            placeholder="Enter first round"
                        />
                    </div>
                </div>
                <div class="relative">
                    <label for="lastRound" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Last Round
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
                    </label>
                    <div class="relative">
                        <i class="fas fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"></i>
                        <input
                            type="text"
                            id="lastRound"
                            bind:value={lastRound}
                            class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                            placeholder="Enter last round"
                        />
                    </div>
                </div>
            </div>

            <div class="relative">
                <label for="keyDilution" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Key Dilution
                    <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
                </label>
                <div class="relative">
                    <i class="fas fa-key absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"></i>
                    <input
                        type="text"
                        id="keyDilution"
                        bind:value={keyDilution}
                        class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                        placeholder="Enter key dilution"
                    />
                </div>
            </div>

            <div>
                <label for="selectionKey" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Selection Key
                    <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
                </label>
                <div class="relative">
                    <input
                        id="selectionKey"
                        bind:value={selectionKey}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm transition-colors"
                        placeholder="Paste selection key"
                    />
                </div>
            </div>

            <div>
                <label for="votingKey" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Voting Key
                    <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
                </label>
                <div class="relative">
                    <input
                        id="votingKey"
                        bind:value={votingKey}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm transition-colors"
                        placeholder="Paste voting key"
                    />
                </div>
            </div>

            <div>
                <label for="stateProofKey" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    State Proof Key
                    <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">(Required)</span>
                </label>
                <div class="relative">
                    <input
                        id="stateProofKey"
                        bind:value={stateProofKey}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm transition-colors"
                        placeholder="Paste state proof key"
                    />
                </div>
            </div>

            <div class="flex justify-end">
                <button
                    on:click={handlePasteAll}
                    class="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors flex items-center gap-2"
                    disabled={isLoading}
                >
                    {#if isLoading}
                        <i class="fas fa-spinner fa-spin"></i>
                    {:else}
                        <i class="fas fa-clipboard"></i>
                    {/if}
                    <span>Paste All from Clipboard</span>
                </button>
            </div>
        </div>
    </div>

    <div slot="footer" class="flex flex-col gap-4">
        {#if error}
            <div class="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm flex items-center gap-2">
                <i class="fas fa-exclamation-triangle"></i>
                <span>{error}</span>
            </div>
        {/if}

        {#if transactionStatus !== 'idle'}
            <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                <div class="flex items-center gap-2 text-sm">
                    {#if transactionStatus === 'building'}
                        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span class="text-blue-700 dark:text-blue-300">Building transaction...</span>
                    {:else if transactionStatus === 'signing'}
                        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span class="text-blue-700 dark:text-blue-300">Waiting for signature...</span>
                    {:else if transactionStatus === 'submitting'}
                        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span class="text-blue-700 dark:text-blue-300">Submitting transaction...</span>
                    {:else if transactionStatus === 'confirming'}
                        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span class="text-blue-700 dark:text-blue-300">Confirming transaction...</span>
                    {:else if transactionStatus === 'success'}
                        <i class="fas fa-check text-green-500"></i>
                        <span class="text-green-700 dark:text-green-300">Transaction successful!</span>
                        {#if transactionId}
                            <a 
                                href={`https://explorer.voi.network/explorer/transaction/${transactionId}`}
                                class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 ml-2"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View in Explorer
                            </a>
                        {/if}
                    {/if}
                </div>
            </div>
        {/if}

        <div class="flex justify-between">
            <div class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md">
                <div class="flex items-center gap-2">
                    <i class="fas fa-info-circle"></i>
                    <span>Transaction Cost: {parentWalletAddress ? '0.002' : '0.001'} VOI</span>
                </div>
            </div>

            <div class="flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                    on:click={() => showModal = false}
                    class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors flex items-center justify-center gap-2"
                    disabled={transactionStatus !== 'idle' && transactionStatus !== 'success'}
                >
                    <i class="fas fa-times"></i>
                    {#if transactionStatus === 'success'}
                        <span>Close</span>
                    {:else}
                        <span>Cancel</span>
                    {/if}
                </button>
                <button
                    on:click={handleSubmit}
                    class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={transactionStatus !== 'idle' || !firstRound || !lastRound || !keyDilution || !selectionKey || !votingKey || !stateProofKey}
                >
                    <i class="fas fa-check"></i>
                    <span>Register Key</span>
                </button>
                {#if isOnline}
                    <button
                        on:click={() => {
                            if (parentWalletAddress === null) {
                                goOfflineWalletVoteKey();
                            } else {
                                goOfflineStakingContractVoteKey();
                            }
                        }}
                        class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={transactionStatus !== 'idle' && transactionStatus !== 'success'}
                    >
                        <i class="fas fa-power-off"></i>
                        <span>Go Offline</span>
                    </button>
                {/if}
            </div>
        </div>
    </div>
</Modal>