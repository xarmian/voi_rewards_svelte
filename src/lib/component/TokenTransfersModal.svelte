<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type { FungibleTokenType, LPToken } from '$lib/types/assets';
    import { formatAddress } from '$lib/utils';
    import { getEnvoiNames } from '$lib/utils/envoi';
    import algosdk from 'algosdk';
    import { algodIndexer } from '$lib/utils/algod';

    export let open = false;
    export let token: FungibleTokenType | LPToken;
    export let walletId: string;
    export let currentPoolBalance: { tokenA: number; tokenB: number } | null = null;

    interface Transfer {
        contractid?: string;
        from: string;
        to: string;
        amount: string;
        round: number;
        transactionid: string;
        timestamp: number;
        from_name?: string;
        to_name?: string;
        note?: string;
        type?: 'payment' | 'fee' | 'inner-payment';
        parentTxId?: string;
        fee?: number;
        isLpExchange?: boolean;
        lpExchangeType?: 'add' | 'remove';
        exchangedTokens?: {
            tokenA?: {
                id: string;
                symbol: string;
                amount: string;
            };
            tokenB?: {
                id: string;
                symbol: string;
                amount: string;
            };
        };
        groupId?: string;
    }

    // Event types for decoding
    const EventType = {
        TRANSFER: 'arc200_Transfer',
        APPROVAL: 'arc200_Approval',
        SWAP: 'Swap',
        DEPOSIT: 'Deposit',
        WITHDRAW: 'Withdraw'
    } as const;
    
    type EventTypeValue = typeof EventType[keyof typeof EventType];

    // Function to decode base64 logs
    function decodeBase64Log(log: string): Buffer {
        return Buffer.from(log, 'base64');
    }

    // Function to calculate event selector from event signature
    function calculateEventSelector(eventName: string, argTypes: string[]): string {
        // In Ethereum/AVM, the event selector is the first 4 bytes of the keccak256 hash of the event signature
        // For simplicity, we're using a mapping approach here since we don't have keccak256 readily available
        
        // Map of known event signatures to their selectors
        // These are the actual selectors for different DEX events based on their ABIs
        const knownSelectors: Record<string, string> = {
            // Nomadex events (uint256 format)
            'arc200_Transfer(address,address,uint256)': '79f88824', // Transfer event
            'arc200_Approval(address,address,uint256)': '8c5be1e5', // Approval event
            'Swap(address,(uint256,uint256),(uint256,uint256),(uint256,uint256))': 'c42079f9', // Swap event
            'Deposit(address,(uint256,uint256),uint256,(uint256,uint256))': '73d468a3', // Deposit event
            'Withdraw(address,uint256,(uint256,uint256),(uint256,uint256))': '9b1bfa7f',  // Withdraw event
            
            // Alternative DEX events (uint64 format)
            'Deposit(address,(uint64,uint64),uint64,(uint64,uint64),(uint64,uint64))': '3d013e7d', // Alt Deposit event
            'Withdraw(address,uint64,(uint64,uint64),(uint64,uint64),(uint64,uint64))': '2c3e5eff',  // Alt Withdraw event
            
            // Additional observed selectors from logs
            'Deposit': '192a776c', // Another observed Deposit selector
            'Withdraw': '151f7c75' // Another observed Withdraw selector
        };
        
        // Construct the event signature
        const signature = `${eventName}(${argTypes.join(',')})`;
        
        // Return the known selector or a fallback
        return knownSelectors[signature] || knownSelectors[eventName] || '';
    }

    // Function to identify event type from log
    function identifyEventType(log: Buffer): EventTypeValue | null {
        if (log.length < 4) {
            return null;
        }
        
        // Extract the selector (first 4 bytes)
        const selector = log.slice(0, 4).toString('hex');
        
        // Hardcoded selectors based on actual DEX implementations
        // These are the actual selectors observed in transaction logs
        const TRANSFER_SELECTOR = '79f88824'; // arc200_Transfer
        const APPROVAL_SELECTOR = '8c5be1e5'; // arc200_Approval
        const SWAP_SELECTOR = 'c42079f9';     // Swap
        
        // Nomadex format (uint256)
        const DEPOSIT_SELECTOR = '73d468a3';
        const WITHDRAW_SELECTOR = '9b1bfa7f';
        
        // Alternative DEX format (uint64)
        // These selectors should match the actual values from the alternative DEX
        // Update these values if they don't match what you observe in transaction logs
        const ALT_DEPOSIT_SELECTOR = '3d013e7d';
        const ALT_WITHDRAW_SELECTOR = '2c3e5eff';
        
        // Additional observed selectors
        const OBSERVED_DEPOSIT_SELECTOR = '192a776c';  // Humble Deposit selector
        const OBSERVED_WITHDRAW_SELECTOR = '151f7c75'; // Humble Withdraw selector
        
        // Combined selectors for easier checking
        const DEPOSIT_SELECTORS = [DEPOSIT_SELECTOR, ALT_DEPOSIT_SELECTOR, OBSERVED_DEPOSIT_SELECTOR];
        const WITHDRAW_SELECTORS = [WITHDRAW_SELECTOR, ALT_WITHDRAW_SELECTOR, OBSERVED_WITHDRAW_SELECTOR];
        
        // Direct selector matching
        if (selector === TRANSFER_SELECTOR) {
            return EventType.TRANSFER;
        } else if (selector === APPROVAL_SELECTOR) {
            return EventType.APPROVAL;
        } else if (selector === SWAP_SELECTOR) {
            return EventType.SWAP;
        } else if (DEPOSIT_SELECTORS.includes(selector)) {
            return EventType.DEPOSIT;
        } else if (WITHDRAW_SELECTORS.includes(selector)) {
            return EventType.WITHDRAW;
        }
        
        // Special handling for Humble selectors to ensure they're properly identified
        if (selector === OBSERVED_DEPOSIT_SELECTOR) {
            return EventType.DEPOSIT;
        } else if (selector === OBSERVED_WITHDRAW_SELECTOR) {
            return EventType.WITHDRAW;
        }
        
        try {
            // For logs of sufficient length, try to decode as both event types
            if (log.length >= 132) { // Minimum length for both event types
                // Try to decode as Deposit
                try {
                    const depositData = decodeDepositEvent(log);
                    if (depositData && depositData.outLpt > 0n) {
                        return EventType.DEPOSIT;
                    }
                } catch (e) {
                    console.log('Failed to decode as Deposit:', e);
                }
                
                // Try to decode as Withdraw
                try {
                    const withdrawData = decodeWithdrawEvent(log);
                    if (withdrawData && withdrawData.inLpt > 0n) {
                        return EventType.WITHDRAW;
                    }
                } catch (e) {
                    console.log('Failed to decode as Withdraw:', e);
                }
                
                // Try alternative format decoders
                try {
                    const altDepositData = decodeAltDepositEvent(log);
                    if (altDepositData && altDepositData.outLpt > 0n) {
                        return EventType.DEPOSIT;
                    }
                } catch (e) {
                    console.log('Failed to decode as Alt Deposit:', e);
                }
                
                try {
                    const altWithdrawData = decodeAltWithdrawEvent(log);
                    if (altWithdrawData && altWithdrawData.inLpt > 0n) {
                        return EventType.WITHDRAW;
                    }
                } catch (e) {
                    console.log('Failed to decode as Alt Withdraw:', e);
                }
            }
        } catch (e) {
            console.error('Error during event type inference:', e);
        }
        
        // If we still can't determine, use log length as a heuristic
        if (log.length >= 100 && log.length < 120) {
            return EventType.TRANSFER;
        }
        
        return null;
    }

    // Function to determine if a log is a Deposit or Withdraw event
    function isDepositOrWithdrawEvent(log: Buffer): { isDeposit: boolean; isWithdraw: boolean } {
        if (log.length < 4) {
            return { isDeposit: false, isWithdraw: false };
        }
        
        try {
            // Extract the selector (first 4 bytes)
            const selector = log.slice(0, 4).toString('hex');
            
            // Hardcoded selectors based on actual DEX implementations
            // Nomadex format (uint256)
            const DEPOSIT_SELECTOR = '73d468a3';
            const WITHDRAW_SELECTOR = '9b1bfa7f';
            
            // Alternative DEX format (uint64)
            const ALT_DEPOSIT_SELECTOR = '3d013e7d';
            const ALT_WITHDRAW_SELECTOR = '2c3e5eff';
            
            // Additional observed selectors
            const OBSERVED_DEPOSIT_SELECTOR = '192a776c';  // Humble Deposit selector
            const OBSERVED_WITHDRAW_SELECTOR = '151f7c75'; // Humble Withdraw selector
            
            // Combined selectors
            const DEPOSIT_SELECTORS = [DEPOSIT_SELECTOR, ALT_DEPOSIT_SELECTOR, OBSERVED_DEPOSIT_SELECTOR];
            const WITHDRAW_SELECTORS = [WITHDRAW_SELECTOR, ALT_WITHDRAW_SELECTOR, OBSERVED_WITHDRAW_SELECTOR];
            
            // Direct selector matching first
            const isDepositBySelector = DEPOSIT_SELECTORS.includes(selector);
            const isWithdrawBySelector = WITHDRAW_SELECTORS.includes(selector);
            
            // Special handling for Humble selectors
            if (selector === OBSERVED_DEPOSIT_SELECTOR) {
                return { isDeposit: true, isWithdraw: false };
            } else if (selector === OBSERVED_WITHDRAW_SELECTOR) {
                return { isDeposit: false, isWithdraw: true };
            }
            
            if (isDepositBySelector || isWithdrawBySelector) {
                // Determine which format matched
                let formatMatched = 'unknown';
                if (selector === DEPOSIT_SELECTOR || selector === WITHDRAW_SELECTOR) {
                    formatMatched = 'standard (uint256)';
                } else if (selector === ALT_DEPOSIT_SELECTOR || selector === ALT_WITHDRAW_SELECTOR) {
                    formatMatched = 'alternative (uint64)';
                } else if (selector === OBSERVED_DEPOSIT_SELECTOR || selector === OBSERVED_WITHDRAW_SELECTOR) {
                    formatMatched = 'Humble format';
                }
                
                return {
                    isDeposit: isDepositBySelector,
                    isWithdraw: isWithdrawBySelector
                };
            }
            
            // Try to decode using all available decoders
            let isDepositByStructure = false;
            let isWithdrawByStructure = false;
            let depositConfidence = 0;
            let withdrawConfidence = 0;
            
            // Try standard format decoders
            try {
                const depositData = decodeDepositEvent(log);
                if (depositData !== null && 
                    depositData.outLpt > 0n && 
                    (depositData.inAmts[0] > 0n || depositData.inAmts[1] > 0n)) {
                    isDepositByStructure = true;
                    depositConfidence = 1;
                    console.log('Identified as Deposit by structure');
                }
            } catch (e) {
                console.log('Failed to decode as Deposit:', e);
            }
            
            try {
                const withdrawData = decodeWithdrawEvent(log);
                if (withdrawData !== null && 
                    withdrawData.inLpt > 0n && 
                    (withdrawData.outAmts[0] > 0n || withdrawData.outAmts[1] > 0n)) {
                    isWithdrawByStructure = true;
                    withdrawConfidence = 1;
                    console.log('Identified as Withdraw by structure');
                }
            } catch (e) {
                console.log('Failed to decode as Withdraw:', e);
            }
            
            // Try alternative format decoders
            if (!isDepositByStructure || depositConfidence < 2) {
                try {
                    const altDepositData = decodeAltDepositEvent(log);
                    if (altDepositData !== null && 
                        altDepositData.outLpt > 0n && 
                        (altDepositData.inAmts[0] > 0n || altDepositData.inAmts[1] > 0n)) {
                        isDepositByStructure = true;
                        depositConfidence = 2; // Higher confidence for alternative format
                    }
                } catch (e) {
                    console.log('Failed to decode as Alt Deposit:', e);
                }
            }
            
            if (!isWithdrawByStructure || withdrawConfidence < 2) {
                try {
                    const altWithdrawData = decodeAltWithdrawEvent(log);
                    if (altWithdrawData !== null && 
                        altWithdrawData.inLpt > 0n && 
                        (altWithdrawData.outAmts[0] > 0n || altWithdrawData.outAmts[1] > 0n)) {
                        isWithdrawByStructure = true;
                        withdrawConfidence = 2; // Higher confidence for alternative format
                    }
                } catch (e) {
                    console.log('Failed to decode as Alt Withdraw:', e);
                }
            }
            
            // If we can identify one but not the other, use that
            if (isDepositByStructure && !isWithdrawByStructure) {
                return { isDeposit: true, isWithdraw: false };
            } else if (!isDepositByStructure && isWithdrawByStructure) {
                return { isDeposit: false, isWithdraw: true };
            } else if (isDepositByStructure && isWithdrawByStructure) {
                // If both match, use confidence level to decide
                if (depositConfidence > withdrawConfidence) {
                    return { isDeposit: true, isWithdraw: false };
                } else if (withdrawConfidence > depositConfidence) {
                    return { isDeposit: false, isWithdraw: true };
                } else {
                    // For the observed format, check if the log looks more like a Deposit or Withdraw
                    // In this specific DEX, the token order might be swapped
                    if (log.length >= 196) {
                        try {
                            // Check if the first value after the address is non-zero (likely inLpt for Withdraw)
                            const potentialInLptHex = log.slice(36, 68).toString('hex');
                            if (potentialInLptHex && potentialInLptHex !== '0000000000000000000000000000000000000000000000000000000000000000') {
                                return { isDeposit: false, isWithdraw: true };
                            } else {
                                return { isDeposit: true, isWithdraw: false };
                            }
                        } catch (e) {
                            console.log('Error during detailed structure check:', e);
                        }
                    }
                }
            }
            
            // If we still can't determine, use log length as a heuristic
            if (log.length >= 196) {
                // For logs of this length, check if it looks more like a Withdraw
                // In a Withdraw event, the first value after the address should be non-zero (inLpt)
                try {
                    const potentialInLptHex = log.slice(36, 68).toString('hex');
                    if (potentialInLptHex && potentialInLptHex !== '0000000000000000000000000000000000000000000000000000000000000000') {
                        return { isDeposit: false, isWithdraw: true };
                    } else {
                        return { isDeposit: true, isWithdraw: false };
                    }
                } catch (e) {
                    console.log('Error checking inLpt value:', e);
                }
            }
            
            return { isDeposit: false, isWithdraw: false };
        } catch (e) {
            console.error('Error during event type determination:', e);
            return { isDeposit: false, isWithdraw: false };
        }
    }

    // Function to decode a Deposit event
    function decodeDepositEvent(log: Buffer): {
        sender: string;
        inAmts: [bigint, bigint];
        outLpt: bigint;
        poolBals: [bigint, bigint];
    } | null {
        try {
            // Check if the log is long enough to contain all the required data
            if (log.length < 196) {
                return null;
            }
            
            // Skip the first 4 bytes (event selector)
            // Sender address (32 bytes)
            const sender = '0x' + log.slice(4, 36).toString('hex');
            
            // Helper function to safely convert hex to BigInt
            const safeHexToBigInt = (hex: string): bigint => {
                if (!hex || hex === '0x' || hex === '') {
                    console.log('Empty hex string, defaulting to 0');
                    return 0n;
                }
                try {
                    return BigInt(`0x${hex}`);
                } catch (e) {
                    console.error('Invalid hex string:', hex);
                    return 0n;
                }
            };
            
            // inAmts (two uint256 values)
            const inAmt1Hex = log.slice(36, 68).toString('hex');
            const inAmt1 = safeHexToBigInt(inAmt1Hex);
            
            const inAmt2Hex = log.slice(68, 100).toString('hex');
            const inAmt2 = safeHexToBigInt(inAmt2Hex);
            
            // outLpt (uint256)
            const outLptHex = log.slice(100, 132).toString('hex');
            const outLpt = safeHexToBigInt(outLptHex);
            
            // poolBals (two uint256 values)
            const poolBal1Hex = log.slice(132, 164).toString('hex');
            const poolBal1 = safeHexToBigInt(poolBal1Hex);
            
            const poolBal2Hex = log.slice(164, 196).toString('hex');
            const poolBal2 = safeHexToBigInt(poolBal2Hex);
            
            return {
                sender,
                inAmts: [inAmt1, inAmt2],
                outLpt,
                poolBals: [poolBal1, poolBal2]
            };
        } catch (error) {
            console.error('Error decoding Deposit event:', error);
            return null;
        }
    }

    // Function to decode a Withdraw event
    function decodeWithdrawEvent(log: Buffer): {
        sender: string;
        inLpt: bigint;
        outAmts: [bigint, bigint];
        poolBals: [bigint, bigint];
    } | null {
        try {
            // Check if the log is long enough to contain all the required data
            if (log.length < 196) {
                return null;
            }
            
            // Skip the first 4 bytes (event selector)
            // Sender address (32 bytes)
            const sender = '0x' + log.slice(4, 36).toString('hex');
            
            // Helper function to safely convert hex to BigInt
            const safeHexToBigInt = (hex: string): bigint => {
                if (!hex || hex === '0x' || hex === '') {
                    console.log('Empty hex string, defaulting to 0');
                    return 0n;
                }
                try {
                    return BigInt(`0x${hex}`);
                } catch (e) {
                    console.error('Invalid hex string:', hex);
                    return 0n;
                }
            };
            
            // inLpt (uint256)
            const inLptHex = log.slice(36, 68).toString('hex');
            const inLpt = safeHexToBigInt(inLptHex);
            
            // outAmts (two uint256 values)
            const outAmt1Hex = log.slice(68, 100).toString('hex');
            const outAmt1 = safeHexToBigInt(outAmt1Hex);
            
            const outAmt2Hex = log.slice(100, 132).toString('hex');
            const outAmt2 = safeHexToBigInt(outAmt2Hex);
            
            // poolBals (two uint256 values)
            const poolBal1Hex = log.slice(132, 164).toString('hex');
            const poolBal1 = safeHexToBigInt(poolBal1Hex);
            
            const poolBal2Hex = log.slice(164, 196).toString('hex');
            const poolBal2 = safeHexToBigInt(poolBal2Hex);
            
            return {
                sender,
                inLpt,
                outAmts: [outAmt1, outAmt2],
                poolBals: [poolBal1, poolBal2]
            };
        } catch (error) {
            console.error('Error decoding Withdraw event:', error);
            return null;
        }
    }

    // Function to decode an alternative format Deposit event (uint64)
    function decodeAltDepositEvent(log: Buffer): {
        sender: string;
        inAmts: [bigint, bigint];
        outLpt: bigint;
        poolBals: [bigint, bigint];
        reserves?: [bigint, bigint]; // Additional parameter
    } | null {
        try {
            // Check if the log is long enough to contain all the required data
            // For the alt format with an extra tuple, we need more bytes
            if (log.length < 228) { // 4 + 32 + 32*2 + 32 + 32*2 + 32*2
                return null;
            }
            
            // Skip the first 4 bytes (event selector)
            // Sender address (32 bytes)
            const sender = '0x' + log.slice(4, 36).toString('hex');
            
            // Helper function to safely convert hex to BigInt
            const safeHexToBigInt = (hex: string): bigint => {
                if (!hex || hex === '0x' || hex === '') {
                    console.log('Empty hex string, defaulting to 0');
                    return 0n;
                }
                try {
                    return BigInt(`0x${hex}`);
                } catch (e) {
                    console.error('Invalid hex string:', hex);
                    return 0n;
                }
            };
            
            // inAmts (two uint64 values in a tuple)
            const inAmt1Hex = log.slice(36, 68).toString('hex');
            const inAmt1 = safeHexToBigInt(inAmt1Hex);
            
            const inAmt2Hex = log.slice(68, 100).toString('hex');
            const inAmt2 = safeHexToBigInt(inAmt2Hex);
            
            // outLpt (uint64)
            const outLptHex = log.slice(100, 132).toString('hex');
            const outLpt = safeHexToBigInt(outLptHex);
            
            // poolBals (two uint64 values in a tuple)
            const poolBal1Hex = log.slice(132, 164).toString('hex');
            const poolBal1 = safeHexToBigInt(poolBal1Hex);
            
            const poolBal2Hex = log.slice(164, 196).toString('hex');
            const poolBal2 = safeHexToBigInt(poolBal2Hex);
            
            // reserves (two uint64 values in a tuple) - additional parameter
            const reserve1Hex = log.slice(196, 228).toString('hex');
            const reserve1 = safeHexToBigInt(reserve1Hex);
            
            const reserve2Hex = log.slice(228, 260).toString('hex');
            const reserve2 = safeHexToBigInt(reserve2Hex);
            
            return {
                sender,
                inAmts: [inAmt1, inAmt2],
                outLpt,
                poolBals: [poolBal1, poolBal2],
                reserves: [reserve1, reserve2]
            };
        } catch (error) {
            console.error('Error decoding Alt Deposit event:', error);
            return null;
        }
    }

    // Function to decode an alternative format Withdraw event (uint64)
    function decodeAltWithdrawEvent(log: Buffer): {
        sender: string;
        inLpt: bigint;
        outAmts: [bigint, bigint];
        poolBals: [bigint, bigint];
        reserves?: [bigint, bigint]; // Additional parameter
    } | null {
        try {
            // Check if the log is long enough to contain all the required data
            // For the alt format with an extra tuple, we need more bytes
            if (log.length < 228) { // 4 + 32 + 32 + 32*2 + 32*2 + 32*2
                return null;
            }
            
            // Skip the first 4 bytes (event selector)
            // Sender address (32 bytes)
            const sender = '0x' + log.slice(4, 36).toString('hex');
            
            // Helper function to safely convert hex to BigInt
            const safeHexToBigInt = (hex: string): bigint => {
                if (!hex || hex === '0x' || hex === '') {
                    console.log('Empty hex string, defaulting to 0');
                    return 0n;
                }
                try {
                    return BigInt(`0x${hex}`);
                } catch (e) {
                    console.error('Invalid hex string:', hex);
                    return 0n;
                }
            };
            
            // inLpt (uint64)
            const inLptHex = log.slice(36, 68).toString('hex');
            const inLpt = safeHexToBigInt(inLptHex);
            
            // outAmts (two uint64 values in a tuple)
            const outAmt1Hex = log.slice(68, 100).toString('hex');
            const outAmt1 = safeHexToBigInt(outAmt1Hex);
            
            const outAmt2Hex = log.slice(100, 132).toString('hex');
            const outAmt2 = safeHexToBigInt(outAmt2Hex);
            
            // poolBals (two uint64 values in a tuple)
            const poolBal1Hex = log.slice(132, 164).toString('hex');
            const poolBal1 = safeHexToBigInt(poolBal1Hex);
            
            const poolBal2Hex = log.slice(164, 196).toString('hex');
            const poolBal2 = safeHexToBigInt(poolBal2Hex);
            
            // reserves (two uint64 values in a tuple) - additional parameter
            const reserve1Hex = log.slice(196, 228).toString('hex');
            const reserve1 = safeHexToBigInt(reserve1Hex);
            
            const reserve2Hex = log.slice(228, 260).toString('hex');
            const reserve2 = safeHexToBigInt(reserve2Hex);
            
            return {
                sender,
                inLpt,
                outAmts: [outAmt1, outAmt2],
                poolBals: [poolBal1, poolBal2],
                reserves: [reserve1, reserve2]
            };
        } catch (error) {
            console.error('Error decoding Alt Withdraw event:', error);
            return null;
        }
    }

    let transfers: Transfer[] = [];
    let filteredTransfers: Transfer[] = [];
    let isLoading = false;
    let error: string | null = null;
    let offset = 0;
    let limit = 50;
    let hasMore = true;
    let expandedRows = new Set<string>();
    let nextToken: string | undefined = undefined;

    // Filter states
    let fromAddress = '';
    let toAddress = '';
    let note = '';
    let showMobileFilters = false;
    let showFeeTransactions = false;
    let showLPExchangeDetails = true;
    
    // LP Statistics
    let showLpStats = true; // Default to showing LP stats
    let totalTokenAAdded = 0;
    let totalTokenBAdded = 0;
    let totalTokenARemoved = 0;
    let totalTokenBRemoved = 0;
    let profitLossA = 0;
    let profitLossB = 0;
    let profitLossPercentA = 0;
    let profitLossPercentB = 0;
    let totalProfitLossA = 0; // Total profit/loss including removed tokens
    let totalProfitLossB = 0; // Total profit/loss including removed tokens
    let totalProfitLossInA = 0; // Total P/L converted to token A
    let totalProfitLossInB = 0; // Total P/L converted to token B
    let totalProfitLossPercentInA = 0; // Total P/L percentage in token A
    let totalProfitLossPercentInB = 0; // Total P/L percentage in token B

    function isLPToken(token: FungibleTokenType | LPToken): token is LPToken {
        return 'poolInfo' in token && token.poolInfo !== undefined;
    }

    function toggleRow(transactionId: string) {
        if (expandedRows.has(transactionId)) {
            expandedRows.delete(transactionId);
        } else {
            expandedRows.add(transactionId);
        }
        expandedRows = expandedRows; // Trigger reactivity
    }

    async function fetchCurrentPoolBalance() {
        if (!isLPToken(token) || !token.poolInfo || currentPoolBalance) return;
        
        try {
            // Calculate user's share of the pool
            const userShare = calculateUserPoolShare();
            
            if (userShare > 0) {
                // For Humble pools, we might need to fetch the latest pool data
                if (token.poolInfo.provider === 'humble' && token.poolInfo.poolId) {
                    try {
                        // Fetch the latest pool data from Humble API
                        const response = await fetch(`https://mainnet-idx.algonode.cloud/v2/accounts/${token.poolInfo.poolId}`);
                        const data = await response.json();
                        
                        if (data && data.account) {
                            // Extract the token balances from the account assets
                            const assets = data.account.assets || [];
                            
                            // Find the token A and token B assets
                            const tokenAAsset = assets.find((asset: any) => asset['asset-id'].toString() === token.poolInfo.tokAId);
                            const tokenBAsset = assets.find((asset: any) => asset['asset-id'].toString() === token.poolInfo.tokBId);
                            
                            if (tokenAAsset && tokenBAsset) {
                                // Calculate the user's share of each token
                                // For Humble, the asset amounts are in raw form and need to be divided by 10^decimals
                                const tokenAAmount = userShare * (Number(tokenAAsset.amount) / Math.pow(10, token.poolInfo.tokADecimals));
                                const tokenBAmount = userShare * (Number(tokenBAsset.amount) / Math.pow(10, token.poolInfo.tokBDecimals));
                                
                                // Update the current pool balance
                                // For Humble pools, multiply by 10^6 to correct the value
                                currentPoolBalance = {
                                    tokenA: tokenAAmount * Math.pow(10, 6),
                                    tokenB: tokenBAmount * Math.pow(10, 6)
                                };
                                
                                return;
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching Humble pool data:', error);
                    }
                }
                                
                // IMPORTANT: For Humble pools, tokABalance and tokBBalance are already in decimal form
                // For other providers, we need to divide by 10^decimals
                let tokenAAmount, tokenBAmount;
                
                if (token.poolInfo.provider === 'humble') {
                    // For Humble pools, multiply by 10^6 to correct the value
                    tokenAAmount = userShare * Number(token.poolInfo.tokABalance) * Math.pow(10, 6);
                    tokenBAmount = userShare * Number(token.poolInfo.tokBBalance) * Math.pow(10, 6);
                } else {
                    tokenAAmount = userShare * (Number(token.poolInfo.tokABalance) / Math.pow(10, token.poolInfo.tokADecimals));
                    tokenBAmount = userShare * (Number(token.poolInfo.tokBBalance) / Math.pow(10, token.poolInfo.tokBDecimals));
                }
                
                // Create currentPoolBalance object
                currentPoolBalance = {
                    tokenA: tokenAAmount,
                    tokenB: tokenBAmount
                };
            }
        } catch (error) {
            console.error('Error fetching current pool balance:', error);
        }
    }

    onMount(() => {
        if (document) {
            document.body.style.overflow = 'hidden';
        }
        
        // If this is an LP token, fetch the current pool balance
        if (isLPToken(token) && token.poolInfo) {
            fetchCurrentPoolBalance();
        }
    });

    onDestroy(() => {
        if (document) {
            document.body.style.overflow = 'unset';
        }
    });

    async function fetchTransfers(append = false) {
        if (isLoading) return;
        isLoading = true;
        error = null;
        try {
            let newTransfers: Transfer[] = [];
            
            if (token.type === 'native') {
                // Fetch all transactions involving this address
                const txns = await algodIndexer
                    .searchForTransactions()
                    .address(walletId)
                    .limit(limit)
                    .nextToken(append && nextToken ? nextToken : '')
                    .do();

                // Store the next token for pagination
                nextToken = txns['next-token'];
                hasMore = !!nextToken;

                // Process each transaction
                txns.transactions.forEach((tx: any) => {
                    const transfers: Transfer[] = [];

                    // Handle different transaction types that affect VOI balance
                    if (tx['tx-type'] === 'pay') {
                        // Regular payment transaction
                        transfers.push({
                            from: tx.sender,
                            to: tx['payment-transaction'].receiver,
                            amount: (tx['payment-transaction'].amount / Math.pow(10, token.decimals)).toString(),
                            round: tx['confirmed-round'],
                            transactionid: tx.id,
                            timestamp: tx['round-time'],
                            note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined,
                            type: 'payment',
                            fee: tx.fee
                        });
                    } else if (tx.sender === walletId && tx.fee > 0 && tx['tx-type'] !== 'pay') {
                        // Only add standalone fee transfer if this is not a payment transaction
                        transfers.push({
                            from: tx.sender,
                            to: 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY',
                            amount: (tx.fee / Math.pow(10, token.decimals)).toString(),
                            round: tx['confirmed-round'],
                            transactionid: tx.id,
                            timestamp: tx['round-time'],
                            note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined,
                            type: 'fee'
                        });
                    }

                    // Handle inner transactions for all transaction types
                    if (tx['inner-txns']) {
                        tx['inner-txns'].forEach((innerTx: any) => {
                            if (innerTx['tx-type'] === 'pay') {
                                transfers.push({
                                    from: innerTx.sender,
                                    to: innerTx['payment-transaction'].receiver,
                                    amount: (innerTx['payment-transaction'].amount / Math.pow(10, token.decimals)).toString(),
                                    round: tx['confirmed-round'],
                                    transactionid: innerTx.id,
                                    timestamp: tx['round-time'],
                                    note: innerTx.note ? Buffer.from(innerTx.note, 'base64').toString() : undefined,
                                    type: 'inner-payment',
                                    parentTxId: tx.id,
                                    fee: 0
                                });
                            }
                        });
                    }

                    // Only add transfers that involve our wallet address
                    newTransfers.push(...transfers.filter(t => 
                        t.from === walletId || t.to === walletId
                    ));
                });

                // Sort by timestamp descending (most recent first)
                newTransfers.sort((a, b) => b.timestamp - a.timestamp);
            } else if (token.type === 'arc200') {
                // Check if this is an LP token
                const isLp = isLPToken(token);
                
                // Fetch ARC200 transfers
                const response = await fetch(`/api/mimir?action=get_arc200_transfers&p_contractid=${token.id}&p_user=${walletId}&p_limit=${limit}&p_offset=${offset}`);
                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                newTransfers = result.data.map((transfer: Transfer) => ({
                    ...transfer,
                    amount: (Number(transfer.amount) / Math.pow(10, token.decimals)).toString()
                }));
                
                // For LP tokens, fetch additional atomic transaction info
                if (isLp && 'poolInfo' in token && token.poolInfo && 
                    'tokAId' in token.poolInfo && 'tokBId' in token.poolInfo && 
                    'tokASymbol' in token.poolInfo && 'tokBSymbol' in token.poolInfo && 
                    'tokADecimals' in token.poolInfo && 'tokBDecimals' in token.poolInfo) {
                    // Process each transfer to find potential atomic group transactions
                    for (let i = 0; i < newTransfers.length; i++) {
                        const transfer = newTransfers[i];
                        try {
                            // Get the transaction details to check for atomic group
                            const txInfo = await algodIndexer.lookupTransactionByID(transfer.transactionid).do();
                            
                            // Check if transaction has logs (for Nomadex events)
                            if (txInfo.transaction.logs && txInfo.transaction.logs.length > 0) {
                                // Process logs to find Deposit or Withdraw events
                                let isDeposit = false;
                                let isWithdraw = false;
                                let tokenAAmount: bigint | null = null;
                                let tokenBAmount: bigint | null = null;
                                let lpTokenAmount: bigint | null = null;
                                let needsTokenSwap = false;
                                let isHumbleFormat = false;
                                
                                for (const logBase64 of txInfo.transaction.logs) {
                                    const logBuffer = decodeBase64Log(logBase64);
                                    
                                    // Extract the selector for token swap detection
                                    const selector = logBuffer.slice(0, 4).toString('hex');
                                    
                                    // Determine if this is Humble's format (needs special handling)
                                    isHumbleFormat = selector === '192a776c' || selector === '151f7c75';
                                    
                                    // Only swap tokens for specific DEXes, NOT for Humble
                                    // Humble's format should NOT have tokens swapped
                                    needsTokenSwap = false;
                                    
                                    // Note: For Humble DEX, the token order is already correct
                                    // - '192a776c' is the Deposit selector (Add Liquidity)
                                    // - '151f7c75' is the Withdraw selector (Remove Liquidity)
                                    
                                    // First try to identify the event type directly
                                    const eventType = identifyEventType(logBuffer);
                                    
                                    // Then check if it's a deposit or withdraw specifically
                                    const { isDeposit: isDepositEvent, isWithdraw: isWithdrawEvent } = isDepositOrWithdrawEvent(logBuffer);
                                    
                                    // For Humble's format, we need to explicitly set the correct event type
                                    // based on the selector, as the structure-based detection might be unreliable
                                    if (isHumbleFormat) {
                                        if (selector === '192a776c') {
                                            isDeposit = true;
                                            isWithdraw = false;
                                        } else if (selector === '151f7c75') {
                                            isDeposit = false;
                                            isWithdraw = true;
                                        }
                                    } else {
                                        // For other DEXes, use the standard detection
                                        if (isDepositEvent && !isWithdrawEvent) {
                                            isDeposit = true;
                                            isWithdraw = false;
                                        } else if (isWithdrawEvent && !isDepositEvent) {
                                            isDeposit = false;
                                            isWithdraw = true;
                                        }
                                    }
                                    
                                    // Check for Deposit event
                                    if (isDepositEvent && !isWithdrawEvent) {
                                        isDeposit = true;
                                        isWithdraw = false;
                                        
                                        // Try both deposit decoders
                                        let depositData = null;
                                        let isAltFormat = false;
                                        
                                        // First try standard format
                                        try {
                                            depositData = decodeDepositEvent(logBuffer);
                                            if (depositData) {
                                                tokenAAmount = depositData.inAmts[0];
                                                tokenBAmount = depositData.inAmts[1];
                                                lpTokenAmount = depositData.outLpt;
                                            }
                                        } catch (e) {
                                            console.log('Failed to decode as standard Deposit:', e);
                                        }
                                        
                                        // If standard format failed, try alternative format
                                        if (!depositData) {
                                            try {
                                                const altDepositData = decodeAltDepositEvent(logBuffer);
                                                if (altDepositData) {
                                                    isAltFormat = true;
                                                    tokenAAmount = altDepositData.inAmts[0];
                                                    tokenBAmount = altDepositData.inAmts[1];
                                                    lpTokenAmount = altDepositData.outLpt;
                                                }
                                            } catch (e) {
                                                console.log('Failed to decode as alternative Deposit:', e);
                                            }
                                        }
                                    } 
                                    // Check for Withdraw event
                                    else if (isWithdrawEvent && !isDepositEvent) {
                                        isDeposit = false;
                                        isWithdraw = true;
                                        
                                        // Try both withdraw decoders
                                        let withdrawData = null;
                                        let isAltFormat = false;
                                        
                                        // First try standard format
                                        try {
                                            withdrawData = decodeWithdrawEvent(logBuffer);
                                            if (withdrawData) {
                                                lpTokenAmount = withdrawData.inLpt;
                                                tokenAAmount = withdrawData.outAmts[0];
                                                tokenBAmount = withdrawData.outAmts[1];
                                            }
                                        } catch (e) {
                                            console.log('Failed to decode as standard Withdraw:', e);
                                        }
                                        
                                        // If standard format failed, try alternative format
                                        if (!withdrawData) {
                                            try {
                                                const altWithdrawData = decodeAltWithdrawEvent(logBuffer);
                                                if (altWithdrawData) {
                                                    isAltFormat = true;
                                                    lpTokenAmount = altWithdrawData.inLpt;
                                                    tokenAAmount = altWithdrawData.outAmts[0];
                                                    tokenBAmount = altWithdrawData.outAmts[1];
                                                }
                                            } catch (e) {
                                                console.log('Failed to decode as alternative Withdraw:', e);
                                            }
                                        }
                                    }
                                    // If we can't determine the event type from the log, try to infer from the transfer direction
                                    else if (!isDeposit && !isWithdraw) {
                                        // For LP tokens:
                                        // - If user is receiving LP tokens, it's likely an add liquidity operation
                                        // - If user is sending LP tokens, it's likely a remove liquidity operation
                                        if (transfer.to === walletId) {
                                            isDeposit = true;
                                            isWithdraw = false;
                                        } else if (transfer.from === walletId) {
                                            isDeposit = false;
                                            isWithdraw = true;
                                        }
                                    }
                                }
                                
                                // If we found a Deposit or Withdraw event, update the transfer with LP exchange details
                                if ((isDeposit || isWithdraw) && (tokenAAmount !== null || tokenBAmount !== null)) {
                                    transfer.isLpExchange = true;
                                    
                                    // SIMPLIFIED APPROACH: Use token transfer direction to determine operation type
                                    // If user is receiving LP tokens, it's Add Liquidity
                                    // If user is sending LP tokens, it's Remove Liquidity
                                    if (transfer.to === walletId) {
                                        transfer.lpExchangeType = 'add';
                                    } else if (transfer.from === walletId) {
                                        transfer.lpExchangeType = 'remove';
                                    } else {
                                        // Fallback to event-based detection if transfer doesn't involve the user directly
                                        transfer.lpExchangeType = isDeposit ? 'add' : 'remove';
                                    }
                                    
                                    // Only swap tokens for specific DEXes, NOT for Humble
                                    if (needsTokenSwap && tokenAAmount !== null && tokenBAmount !== null) {
                                        // Swap token A and B
                                        [tokenAAmount, tokenBAmount] = [tokenBAmount, tokenAAmount];
                                    }
                                    
                                    // For Humble, ensure the correct operation type based on the selector
                                    if (isHumbleFormat) {
                                        // For Humble format, we already set the correct operation type earlier
                                        // based on the selector, so we don't need to do anything here
                                    }
                                    
                                    // Convert BigInt to string with proper decimal places
                                    // Handle potential numeric conversion issues
                                    let tokenAAmountStr = "Unknown";
                                    let tokenBAmountStr = "Unknown";
                                    
                                    try {
                                        // For very large numbers, BigInt to Number conversion might lose precision
                                        // Use a safer approach for display purposes
                                        if (tokenAAmount !== null) {
                                            if (tokenAAmount < 9007199254740991n) { // Max safe integer in JS
                                                tokenAAmountStr = (Number(tokenAAmount) / Math.pow(10, token.poolInfo.tokADecimals)).toFixed(token.poolInfo.tokADecimals);
                                            } else {
                                                // For very large numbers, format manually
                                                const divisor = BigInt(10 ** token.poolInfo.tokADecimals);
                                                const wholePart = tokenAAmount / divisor;
                                                const fractionalPart = tokenAAmount % divisor;
                                                tokenAAmountStr = wholePart.toString() + '.' + fractionalPart.toString().padStart(token.poolInfo.tokADecimals, '0');
                                            }
                                        }
                                        
                                        if (tokenBAmount !== null) {
                                            if (tokenBAmount < 9007199254740991n) { // Max safe integer in JS
                                                tokenBAmountStr = (Number(tokenBAmount) / Math.pow(10, token.poolInfo.tokBDecimals)).toFixed(token.poolInfo.tokBDecimals);
                                            } else {
                                                // For very large numbers, format manually
                                                const divisor = BigInt(10 ** token.poolInfo.tokBDecimals);
                                                const wholePart = tokenBAmount / divisor;
                                                const fractionalPart = tokenBAmount % divisor;
                                                tokenBAmountStr = wholePart.toString() + '.' + fractionalPart.toString().padStart(token.poolInfo.tokBDecimals, '0');
                                            }
                                        }
                                    } catch (e) {
                                        console.error('Error formatting token amounts:', e);
                                    }
                                    
                                    transfer.exchangedTokens = {
                                        tokenA: {
                                            id: token.poolInfo.tokAId,
                                            symbol: token.poolInfo.tokASymbol,
                                            amount: tokenAAmountStr
                                        },
                                        tokenB: {
                                            id: token.poolInfo.tokBId,
                                            symbol: token.poolInfo.tokBSymbol,
                                            amount: tokenBAmountStr
                                        }
                                    };
                                } 
                                // If we couldn't extract token amounts but we know it's an LP exchange
                                else if (isDeposit || isWithdraw) {
                                    transfer.isLpExchange = true;
                                    
                                    // SIMPLIFIED APPROACH: Use token transfer direction
                                    if (transfer.to === walletId) {
                                        transfer.lpExchangeType = 'add';
                                    } else if (transfer.from === walletId) {
                                        transfer.lpExchangeType = 'remove';
                                    } else {
                                        // Fallback to event-based detection
                                        transfer.lpExchangeType = isDeposit ? 'add' : 'remove';
                                    }
                                    
                                    // Set placeholder token amounts
                                    transfer.exchangedTokens = {
                                        tokenA: {
                                            id: token.poolInfo.tokAId,
                                            symbol: token.poolInfo.tokASymbol,
                                            amount: "Unknown"
                                        },
                                        tokenB: {
                                            id: token.poolInfo.tokBId,
                                            symbol: token.poolInfo.tokBSymbol,
                                            amount: "Unknown"
                                        }
                                    };
                                }
                                // If we couldn't identify any LP events but it's an LP token transfer
                                else if (isLPToken(token)) {
                                    // For LP tokens, if the user is sending the token, it's a remove liquidity operation
                                    // If the user is receiving the token, it's an add liquidity operation
                                    if (transfer.from === walletId) {
                                        transfer.isLpExchange = true;
                                        transfer.lpExchangeType = 'remove';
                                    } else if (transfer.to === walletId) {
                                        transfer.isLpExchange = true;
                                        transfer.lpExchangeType = 'add';
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('Error processing LP transaction:', err);
                        }
                    }
                }
                
                // For ARC200, use length-based pagination
                hasMore = newTransfers.length === limit;
            } else {
                // Fetch VSA transfers
                const assetId = Number(token.id);
                const txns = await algodIndexer
                    .searchForTransactions()
                    .assetID(assetId)
                    .address(walletId)
                    .limit(limit)
                    .nextToken(append && nextToken ? nextToken : '')
                    .do();

                // Store the next token for pagination
                nextToken = txns['next-token'];
                hasMore = !!nextToken;

                newTransfers = txns.transactions
                    .filter((tx: any) => tx['tx-type'] === 'axfer')
                    .map((tx: any) => ({
                        from: tx.sender,
                        to: tx['asset-transfer-transaction'].receiver,
                        amount: (tx['asset-transfer-transaction'].amount / Math.pow(10, token.decimals)).toString(),
                        round: tx['confirmed-round'],
                        transactionid: tx.id,
                        timestamp: tx['round-time'],
                        note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined
                    }));
            }

            // Don't append empty results
            if (newTransfers.length === 0) {
                hasMore = false;
                isLoading = false;
                return;
            }

            // collect unique addresses
            const uniqueAddresses = [...new Set([...transfers.map((t: Transfer) => t.from), ...newTransfers.map((t: Transfer) => t.from), ...newTransfers.map((t: Transfer) => t.to)])];
            const envoiNames = await getEnvoiNames(uniqueAddresses);
            newTransfers.forEach((t: Transfer) => {
                if (t.to === 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY') {
                    t.to_name = 'Fee Sink';
                } else {
                    t.to_name = envoiNames.find(n => n.address === t.to)?.name || undefined;
                }
                t.from_name = envoiNames.find(n => n.address === t.from)?.name || undefined;
            });

            if (append) {
                transfers = [...transfers, ...newTransfers];
            } else {
                transfers = newTransfers;
            }
            applyFilters();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to fetch transfers';
            hasMore = false;
        } finally {
            isLoading = false;
        }
    }

    function applyFilters() {
        filteredTransfers = transfers.filter(transfer => {
            // First apply fee transaction filter
            if (!showFeeTransactions && transfer.type === 'fee') {
                return false;
            }

            const matchesFromAddress = !fromAddress || 
                transfer.from.toLowerCase().includes(fromAddress.toLowerCase()) ||
                transfer.from_name?.toLowerCase().includes(fromAddress.toLowerCase());
            const matchesToAddress = !toAddress || 
                transfer.to.toLowerCase().includes(toAddress.toLowerCase()) ||
                transfer.to_name?.toLowerCase().includes(toAddress.toLowerCase());
            const matchesNote = !note || 
                (transfer.note?.toLowerCase().includes(note.toLowerCase()) ?? false);
            return matchesFromAddress && matchesToAddress && matchesNote;
        });
    }

    function handleScroll(e: Event) {
        const target = e.target as HTMLDivElement;
        const bottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
        
        if (bottom && !isLoading && hasMore) {
            if (token.type === 'arc200') {
                offset += limit;
            }
            fetchTransfers(true);
        }
    }

    function formatTimestamp(timestamp: number): string {
        return new Date(timestamp * 1000).toLocaleString();
    }

    function getPoolUrl(): string | undefined {
        if (!isLPToken(token) || !token.poolInfo || !token.poolInfo.provider || !token.poolInfo.poolId) {
            return undefined;
        }
        
        if (token.poolInfo.provider === 'humble') {
            return `https://voi.humble.sh/#/pool/details?poolId=${token.poolInfo.poolId}`;
        } else if (token.poolInfo.provider === 'nomadex') {
            // Check if we have tokAType and tokBType
            if (token.poolInfo.tokAType && token.poolInfo.tokBType && 
                token.poolInfo.tokAId && token.poolInfo.tokBId) {
                return `https://voi.nomadex.app/${token.poolInfo.tokAType}/${token.poolInfo.tokAId}/${token.poolInfo.tokBType}/${token.poolInfo.tokBId}`;
            } else {
                return `https://voi.nomadex.app/liquidity/${token.poolInfo.poolId}`;
            }
        }
        
        return undefined;
    }

    function calculateRunningBalance(transfer: Transfer, index: number): string {
        // Start with current balance in decimal form
        let runningBalance = Number(token.balance) / Math.pow(10, token.decimals);
        
        // Go through all newer transactions (from 0 to current index-1)
        // and reverse their effects to get the historical balance
        for (let i = 0; i < index; i++) {
            const t = filteredTransfers[i];
            const amount = Number(t.amount);
            
            // When going backwards in time:
            // 1. If we received money after this point, we need to subtract it to get the historical balance
            // 2. If we sent money after this point, we need to add it back to get the historical balance
            // 3. If we paid fees after this point, we need to add them back to get the historical balance
            if (t.type === 'fee') {
                runningBalance += amount; // Add back fees that were paid after this point
            } else if (t.to === walletId) {
                runningBalance -= amount; // Subtract money we received after this point
            } else if (t.from === walletId) {
                runningBalance += amount; // Add back money we sent after this point
            }
        }
        
        return runningBalance.toFixed(token.decimals);
    }

    function formatChange(transfer: Transfer): string {
        // Amount is already in decimal form
        const amount = Number(transfer.amount);
        if (transfer.type === 'fee') {
            return `-${amount.toFixed(token.decimals)}`; // Fees are always negative
        }
        if (transfer.to === walletId) {
            return `+${amount.toFixed(token.decimals)}`;
        }
        if (transfer.from === walletId) {
            return `-${amount.toFixed(token.decimals)}`;
        }
        return amount.toFixed(token.decimals);
    }

    function calculateLPStatistics() {
        if (!isLPToken(token) || !token.poolInfo) return;
        
        try {
            // Reset totals
            totalTokenAAdded = 0;
            totalTokenBAdded = 0;
            totalTokenARemoved = 0;
            totalTokenBRemoved = 0;
            
            // Process all transfers to calculate totals
            for (const transfer of transfers) {
                if (transfer.isLpExchange && transfer.exchangedTokens) {
                    const { tokenA, tokenB } = transfer.exchangedTokens;
                    
                    if (transfer.lpExchangeType === 'add') {
                        // Adding liquidity - user provided these tokens
                        if (tokenA && tokenA.amount !== "Unknown") {
                            try {
                                const amount = parseFloat(tokenA.amount);
                                totalTokenAAdded += amount;
                            } catch (e) {
                                console.error('Error parsing tokenA amount:', tokenA.amount, e);
                            }
                        }
                        if (tokenB && tokenB.amount !== "Unknown") {
                            try {
                                const amount = parseFloat(tokenB.amount);
                                totalTokenBAdded += amount;
                            } catch (e) {
                                console.error('Error parsing tokenB amount:', tokenB.amount, e);
                            }
                        }
                    } else if (transfer.lpExchangeType === 'remove') {
                        // Removing liquidity - user received these tokens back
                        if (tokenA && tokenA.amount !== "Unknown") {
                            try {
                                const amount = parseFloat(tokenA.amount);
                                totalTokenARemoved += amount;
                            } catch (e) {
                                console.error('Error parsing tokenA amount:', tokenA.amount, e);
                            }
                        }
                        if (tokenB && tokenB.amount !== "Unknown") {
                            try {
                                const amount = parseFloat(tokenB.amount);
                                totalTokenBRemoved += amount;
                            } catch (e) {
                                console.error('Error parsing tokenB amount:', tokenB.amount, e);
                            }
                        }
                    }
                }
            }
            
            
            // If we don't have currentPoolBalance but we have token.poolInfo, calculate it
            if (!currentPoolBalance && isLPToken(token) && token.poolInfo) {
                fetchCurrentPoolBalance();
            }
            
            // Calculate profit/loss if we have current pool balance
            if (currentPoolBalance) {
                // Net contribution (what user put in minus what they took out)
                const netContributionA = totalTokenAAdded - totalTokenARemoved;
                const netContributionB = totalTokenBAdded - totalTokenBRemoved;
                
                // Current value minus net contribution = profit/loss
                profitLossA = currentPoolBalance.tokenA - netContributionA;
                profitLossB = currentPoolBalance.tokenB - netContributionB;
                
                // Calculate total profit/loss (including tokens already removed)
                // Total P/L = Current value + Total removed - Total added
                totalProfitLossA = currentPoolBalance.tokenA + totalTokenARemoved - totalTokenAAdded;
                totalProfitLossB = currentPoolBalance.tokenB + totalTokenBRemoved - totalTokenBAdded;
                
                // Calculate percentage profit/loss
                if (netContributionA > 0) {
                    profitLossPercentA = (profitLossA / netContributionA) * 100;
                } else {
                    profitLossPercentA = 0;
                }
                
                if (netContributionB > 0) {
                    profitLossPercentB = (profitLossB / netContributionB) * 100;
                } else {
                    profitLossPercentB = 0;
                }
                
                // Calculate the ratio between token A and token B in the pool
                // This ratio represents the current exchange rate between the tokens
                let exchangeRateAtoB = 0;
                let exchangeRateBtoA = 0;
                
                if (currentPoolBalance.tokenA > 0 && currentPoolBalance.tokenB > 0) {
                    exchangeRateAtoB = currentPoolBalance.tokenB / currentPoolBalance.tokenA;
                    exchangeRateBtoA = currentPoolBalance.tokenA / currentPoolBalance.tokenB;
                    
                    // Calculate total P/L converted to token A
                    // This is: P/L in token A + (P/L in token B converted to token A)
                    totalProfitLossInA = totalProfitLossA + (totalProfitLossB * exchangeRateBtoA);
                    
                    // Calculate total P/L converted to token B
                    // This is: P/L in token B + (P/L in token A converted to token B)
                    totalProfitLossInB = totalProfitLossB + (totalProfitLossA * exchangeRateAtoB);
                    
                    // Calculate percentage profit/loss for the converted values
                    const totalInvestedInA = totalTokenAAdded + (totalTokenBAdded * exchangeRateBtoA);
                    const totalInvestedInB = totalTokenBAdded + (totalTokenAAdded * exchangeRateAtoB);
                    
                    if (totalInvestedInA > 0) {
                        totalProfitLossPercentInA = (totalProfitLossInA / totalInvestedInA) * 100;
                    }
                    
                    if (totalInvestedInB > 0) {
                        totalProfitLossPercentInB = (totalProfitLossInB / totalInvestedInB) * 100;
                    }
                }
            }
        } catch (error) {
            console.error('Error calculating LP statistics:', error);
        }
    }
    
    // Calculate user's share of the pool
    function calculateUserPoolShare(): number {
        if (!isLPToken(token) || !token.poolInfo) return 0;
        
        try {
            // User's LP token balance in decimal form
            const userLpBalance = Number(token.balance) / Math.pow(10, token.decimals);
            
            // Total supply of LP tokens
            let totalSupply;
            
            // For Humble pools, the totalSupply is already in decimal form
            if (token.poolInfo.provider === 'humble') {
                totalSupply = Number(token.poolInfo.totalSupply);
            } else {
                // For other providers, we need to divide by 10^decimals
                totalSupply = Number(token.poolInfo.totalSupply) / Math.pow(10, token.decimals);
            }
            
            // Calculate user's share as a decimal (0-1)
            if (totalSupply > 0 && userLpBalance > 0) {
                const share = userLpBalance / totalSupply;
                return share;
            }
            
            return 0;
        } catch (error) {
            console.error('Error calculating user pool share:', error);
            return 0;
        }
    }

    function formatNumber(value: number, decimals: number): string {
        if (isNaN(value) || !isFinite(value)) return '0';
        
        try {
            return value.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: decimals
            });
        } catch (error) {
            console.error('Error formatting number:', error);
            return value.toString();
        }
    }

    $: if (open) {
        offset = 0;
        nextToken = undefined;
        transfers = [];
        filteredTransfers = [];
        fetchTransfers();
    }

    $: {
        fromAddress;
        toAddress;
        note;
        showFeeTransactions;
        showLPExchangeDetails;
        applyFilters();
    }
    
    // Recalculate LP statistics when transfers change
    $: if (transfers.length > 0 && isLPToken(token)) {
        calculateLPStatistics();
    }
</script>

{#if open}
<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
    <div class="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
            <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                    {token.symbol} Transfers
                </h2>
                <div class="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Current Balance: <span class="font-medium">{token.balance / Math.pow(10, token.decimals)} {token.symbol}</span>
                </div>
            </div>
            <button 
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                on:click={() => open = false}
                aria-label="Close"
            >
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Filters Section -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <!-- Desktop Filters -->
            <div class="hidden md:grid grid-cols-{isLPToken(token) ? '4' : (token.type === 'native' ? '4' : '3')} gap-4">
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">From Address</label>
                    <input
                        type="text"
                        bind:value={fromAddress}
                        placeholder="Search from address"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    />
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">To Address</label>
                    <input
                        type="text"
                        bind:value={toAddress}
                        placeholder="Search to address"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    />
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Note</label>
                    <input
                        type="text"
                        bind:value={note}
                        placeholder="Search note"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    />
                </div>
                {#if token.type === 'native'}
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Show Fee Transactions</label>
                        <div class="flex items-center">
                            <button
                                class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full text-left flex justify-between items-center {showFeeTransactions ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-700/50'}"
                                on:click={() => showFeeTransactions = !showFeeTransactions}
                            >
                                <span class="text-sm text-gray-700 dark:text-gray-300">{showFeeTransactions ? 'Showing' : 'Hidden'}</span>
                                <i class="fas fa-toggle-{showFeeTransactions ? 'on text-blue-500' : 'off text-gray-400'}"></i>
                            </button>
                        </div>
                    </div>
                {:else if isLPToken(token)}
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Show LP Exchange Details</label>
                        <div class="flex items-center">
                            <button
                                class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full text-left flex justify-between items-center {showLPExchangeDetails ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-700/50'}"
                                on:click={() => showLPExchangeDetails = !showLPExchangeDetails}
                            >
                                <span class="text-sm text-gray-700 dark:text-gray-300">{showLPExchangeDetails ? 'Showing' : 'Hidden'}</span>
                                <i class="fas fa-toggle-{showLPExchangeDetails ? 'on text-blue-500' : 'off text-gray-400'}"></i>
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Mobile Filters -->
            <div class="md:hidden">
                <button
                    class="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                    on:click={() => showMobileFilters = !showMobileFilters}
                >
                    <span>Filters</span>
                    <i class="fas fa-{showMobileFilters ? 'chevron-up' : 'chevron-down'}"></i>
                </button>
                
                {#if showMobileFilters}
                    <div class="mt-2 space-y-2 animate-slideDown">
                        <div class="relative">
                            <input
                                type="text"
                                bind:value={fromAddress}
                                placeholder="From address"
                                class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            />
                            <i class="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        </div>
                        <div class="relative">
                            <input
                                type="text"
                                bind:value={toAddress}
                                placeholder="To address"
                                class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            />
                            <i class="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        </div>
                        <div class="relative">
                            <input
                                type="text"
                                bind:value={note}
                                placeholder="Search note"
                                class="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            />
                            <i class="fas fa-note-sticky absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        </div>
                        {#if token.type === 'native'}
                            <button
                                class="w-full px-4 py-2 text-left text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md flex justify-between items-center {showFeeTransactions ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-700/50'}"
                                on:click={() => showFeeTransactions = !showFeeTransactions}
                            >
                                <span class="text-gray-700 dark:text-gray-300">Show Fee Transactions</span>
                                <i class="fas fa-toggle-{showFeeTransactions ? 'on text-blue-500' : 'off text-gray-400'}"></i>
                            </button>
                        {:else if isLPToken(token)}
                            <button
                                class="w-full px-4 py-2 text-left text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md flex justify-between items-center {showLPExchangeDetails ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-700/50'}"
                                on:click={() => showLPExchangeDetails = !showLPExchangeDetails}
                            >
                                <span class="text-gray-700 dark:text-gray-300">Show LP Exchange Details</span>
                                <i class="fas fa-toggle-{showLPExchangeDetails ? 'on text-blue-500' : 'off text-gray-400'}"></i>
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <!-- Main scrollable content area -->
        <div 
            class="flex-1 overflow-auto p-4" 
            on:scroll={handleScroll}
            style="max-height: calc(90vh - {isLPToken(token) ? '220px' : '180px'}); min-height: 250px;"
        >
            <!-- LP Statistics Content - Now inside the scrollable area -->
            {#if isLPToken(token) && token.poolInfo && showLpStats}
                <div class="mb-4 animate-slideDown">
                    {#if transfers.some(t => t.isLpExchange)}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <!-- Token A Statistics -->
                            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {token.poolInfo.tokASymbol} Statistics
                                </h4>
                                <div class="space-y-1 text-sm">
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-400">Total Added:</span>
                                        <span class="font-medium">{formatNumber(totalTokenAAdded, token.poolInfo.tokADecimals)} {token.poolInfo.tokASymbol}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-400">Total Removed:</span>
                                        <span class="font-medium">{formatNumber(totalTokenARemoved, token.poolInfo.tokADecimals)} {token.poolInfo.tokASymbol}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-400">Net Contribution:</span>
                                        <span class="font-medium">{formatNumber(totalTokenAAdded - totalTokenARemoved, token.poolInfo.tokADecimals)} {token.poolInfo.tokASymbol}</span>
                                    </div>
                                    {#if currentPoolBalance}
                                        <div class="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                                            <div class="flex justify-between">
                                                <span class="text-gray-600 dark:text-gray-400">Current Value:</span>
                                                <span class="font-medium">{formatNumber(currentPoolBalance.tokenA, token.poolInfo.tokADecimals)} {token.poolInfo.tokASymbol}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-600 dark:text-gray-400">Token P/L:</span>
                                                <span class="font-medium {profitLossA >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                                                    {profitLossA >= 0 ? '+' : ''}{formatNumber(profitLossA, token.poolInfo.tokADecimals)} {token.poolInfo.tokASymbol}
                                                    ({profitLossA >= 0 ? '+' : ''}{formatNumber(profitLossPercentA, 2)}%)
                                                </span>
                                            </div>
                                            
                                            <!-- New: Total P/L converted to token A -->
                                            <div class="flex justify-between font-medium border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                                                <span class="text-gray-700 dark:text-gray-300">Combined P/L in {token.poolInfo.tokASymbol}:</span>
                                                <span class="{totalProfitLossInA >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                                                    {totalProfitLossInA >= 0 ? '+' : ''}{formatNumber(totalProfitLossInA, token.poolInfo.tokADecimals)} {token.poolInfo.tokASymbol}
                                                    ({totalProfitLossPercentInA >= 0 ? '+' : ''}{formatNumber(totalProfitLossPercentInA, 2)}%)
                                                </span>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                            
                            <!-- Token B Statistics -->
                            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {token.poolInfo.tokBSymbol} Statistics
                                </h4>
                                <div class="space-y-1 text-sm">
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-400">Total Added:</span>
                                        <span class="font-medium">{formatNumber(totalTokenBAdded, token.poolInfo.tokBDecimals)} {token.poolInfo.tokBSymbol}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-400">Total Removed:</span>
                                        <span class="font-medium">{formatNumber(totalTokenBRemoved, token.poolInfo.tokBDecimals)} {token.poolInfo.tokBSymbol}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-600 dark:text-gray-400">Net Contribution:</span>
                                        <span class="font-medium">{formatNumber(totalTokenBAdded - totalTokenBRemoved, token.poolInfo.tokBDecimals)} {token.poolInfo.tokBSymbol}</span>
                                    </div>
                                    {#if currentPoolBalance}
                                        <div class="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                                            <div class="flex justify-between">
                                                <span class="text-gray-600 dark:text-gray-400">Current Value:</span>
                                                <span class="font-medium">{formatNumber(currentPoolBalance.tokenB, token.poolInfo.tokBDecimals)} {token.poolInfo.tokBSymbol}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-gray-600 dark:text-gray-400">Token P/L:</span>
                                                <span class="font-medium {profitLossB >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                                                    {profitLossB >= 0 ? '+' : ''}{formatNumber(profitLossB, token.poolInfo.tokBDecimals)} {token.poolInfo.tokBSymbol}
                                                    ({profitLossB >= 0 ? '+' : ''}{formatNumber(profitLossPercentB, 2)}%)
                                                </span>
                                            </div>
                                            
                                            <!-- New: Total P/L converted to token B -->
                                            <div class="flex justify-between font-medium border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                                                <span class="text-gray-700 dark:text-gray-300">Combined P/L in {token.poolInfo.tokBSymbol}:</span>
                                                <span class="{totalProfitLossInB >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                                                    {totalProfitLossInB >= 0 ? '+' : ''}{formatNumber(totalProfitLossInB, token.poolInfo.tokBDecimals)} {token.poolInfo.tokBSymbol}
                                                    ({totalProfitLossPercentInB >= 0 ? '+' : ''}{formatNumber(totalProfitLossPercentInB, 2)}%)
                                                </span>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Note about calculations -->
                        <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                            Note: These statistics are calculated based on your transaction history. Profit/loss calculations include fees, impermanent loss, and rewards.
                        </div>
                    {:else if !isLoading}
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                            <div class="text-gray-500 dark:text-gray-400 mb-2">
                                <i class="fas fa-info-circle text-xl"></i>
                            </div>
                            <p class="text-gray-700 dark:text-gray-300">No LP transactions found in your history.</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Statistics will appear here once you've added or removed liquidity from this pool.
                            </p>
                            {#if currentPoolBalance}
                                <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Current Pool Balance:</p>
                                    <div class="flex justify-center gap-4 mt-2">
                                        <div class="text-sm">
                                            <span class="font-medium">{formatNumber(currentPoolBalance.tokenA, token.poolInfo.tokADecimals)}</span>
                                            <span class="text-gray-500 dark:text-gray-400">{token.poolInfo.tokASymbol}</span>
                                        </div>
                                        <div class="text-sm">
                                            <span class="font-medium">{formatNumber(currentPoolBalance.tokenB, token.poolInfo.tokBDecimals)}</span>
                                            <span class="text-gray-500 dark:text-gray-400">{token.poolInfo.tokBSymbol}</span>
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}

            {#if error}
                <div class="text-red-500 text-center py-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    {error}
                </div>
            {:else if filteredTransfers.length === 0 && !isLoading}
                <div class="text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    No transfers found
                </div>
            {:else}
                <div class="space-y-3">
                    {#each filteredTransfers as transfer, index (`${transfer.transactionid}-${transfer.round}-${index}`)}
                        <div class="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 {transfer.type === 'inner-payment' ? 'ml-4 border-l-4 border-l-purple-200 dark:border-l-purple-800' : ''}">
                            <div class="p-3 md:p-4">
                                <!-- Mobile Layout -->
                                <div class="md:hidden">
                                    <div class="flex justify-between items-start mb-2">
                                        <div>
                                            <div class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                                {transfer.amount} {token.symbol}
                                                {#if transfer.type === 'fee'}
                                                    <span class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                                                        Fee
                                                    </span>
                                                {:else if transfer.type === 'inner-payment'}
                                                    <span class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 rounded-full">
                                                        Inner
                                                    </span>
                                                {:else if transfer.isLpExchange}
                                                    <span class="px-2 py-0.5 text-xs font-medium 
                                                        {transfer.lpExchangeType === 'add' ? 
                                                            'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 
                                                            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'} rounded-full">
                                                        {transfer.lpExchangeType === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
                                                    </span>
                                                {/if}
                                            </div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                                {formatTimestamp(transfer.timestamp)}
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-sm">
                                                <span class={`font-medium ${transfer.to === walletId ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    {formatChange(transfer)} {token.symbol}
                                                </span>
                                                    {#if token.type === 'native' && transfer.type === 'payment' && transfer.fee && transfer.fee > 0 && transfer.from === walletId}
                                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                                            -{(transfer.fee / Math.pow(10, token.decimals)).toFixed(token.decimals)} {token.symbol} fee
                                                        </div>
                                                    {/if}
                                            </div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                                Balance: {calculateRunningBalance(transfer, index)} {token.symbol}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="space-y-2">
                                        <div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">From</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.from}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="break-all">
                                                    {#if transfer.from_name}
                                                        <span class="font-medium">{transfer.from_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.from)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.from)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                        <div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">To</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.to}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="break-all">
                                                    {#if transfer.to_name}
                                                        <span class="font-medium">{transfer.to_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.to)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.to)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <!-- Desktop Layout -->
                                <div class="hidden md:flex items-start gap-4 md:gap-6">
                                    <div class="flex-none w-44">
                                        <div class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                            {transfer.amount} {token.symbol}
                                            {#if transfer.type === 'fee'}
                                                <span class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                                                    Fee
                                                </span>
                                            {:else if transfer.type === 'inner-payment'}
                                                <span class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 rounded-full">
                                                    Inner
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            {formatTimestamp(transfer.timestamp)}
                                        </div>
                                    </div>
                                    
                                    <div class="flex-1 min-w-0 grid grid-cols-2 gap-2 md:gap-6">
                                        <div class="min-w-0">
                                            <div class="text-xs text-gray-500 dark:text-gray-400">From</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.from}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="truncate">
                                                    {#if transfer.from_name}
                                                        <span class="font-medium">{transfer.from_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.from)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.from)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="text-xs text-gray-500 dark:text-gray-400">To</div>
                                            <a 
                                                href={`https://explorer.voi.network/explorer/account/${transfer.to}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-sm block"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div class="truncate">
                                                    {#if transfer.to_name}
                                                        <span class="font-medium">{transfer.to_name}</span>
                                                        <span class="text-gray-500 dark:text-gray-400 ml-1">({formatAddress(transfer.to)})</span>
                                                    {:else}
                                                        {formatAddress(transfer.to)}
                                                    {/if}
                                                </div>
                                            </a>
                                        </div>
                                    </div>

                                    <div class="flex-none w-44 text-right">
                                        <div class="text-sm">
                                            <span class={`font-medium ${transfer.to === walletId ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {formatChange(transfer)} {token.symbol}
                                            </span>
                                                {#if token.type === 'native' && transfer.type === 'payment' && transfer.fee && transfer.fee > 0 && transfer.from === walletId}
                                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                                        -{(transfer.fee / Math.pow(10, token.decimals)).toFixed(token.decimals)} {token.symbol} fee
                                                    </div>
                                                {/if}
                                        </div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            Balance: {calculateRunningBalance(transfer, index)} {token.symbol}
                                        </div>
                                    </div>
                                </div>

                                <!-- Main content area with View link at top-right -->
                                <div class="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
                                    <div class="flex justify-between items-start">
                                        <!-- Left side content (LP Exchange details and/or Note) -->
                                        <div class="flex-1">
                                            <!-- LP Exchange Information (conditionally shown) -->
                                            {#if transfer.isLpExchange && transfer.exchangedTokens && showLPExchangeDetails}
                                                <div class="flex flex-col md:flex-row gap-2 md:gap-4">
                                                    <div class="flex-none md:w-[12rem]">
                                                        {#if transfer.isLpExchange}
                                                        <span class="px-2 py-1 text-xs font-medium 
                                                            {transfer.lpExchangeType === 'add' ? 
                                                                'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 
                                                                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'} rounded-full">
                                                            {transfer.lpExchangeType === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
                                                        </span>
                                                        {/if}
        
                                                    </div>
                                                    <div class="flex-none">
                                                        <div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            {transfer.lpExchangeType === 'add' ? 'Tokens Provided' : 'Tokens Received'}
                                                        </div>
                                                        <div class="flex flex-col gap-2">
                                                            {#if transfer.exchangedTokens.tokenA}
                                                                <div class="flex items-center gap-2">
                                                                    <div class="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full">
                                                                        <i class="fas fa-coins text-gray-600 dark:text-gray-400 text-xs"></i>
                                                                    </div>
                                                                    <div>
                                                                        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                                            {transfer.exchangedTokens.tokenA.amount} {transfer.exchangedTokens.tokenA.symbol}
                                                                        </span>
                                                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                                                            Token ID: {transfer.exchangedTokens.tokenA.id}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            {/if}
                                                            {#if transfer.exchangedTokens.tokenB}
                                                                <div class="flex items-center gap-2">
                                                                    <div class="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full">
                                                                        <i class="fas fa-coins text-gray-600 dark:text-gray-400 text-xs"></i>
                                                                    </div>
                                                                    <div>
                                                                        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                                            {transfer.exchangedTokens.tokenB.amount} {transfer.exchangedTokens.tokenB.symbol}
                                                                        </span>
                                                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                                                            Token ID: {transfer.exchangedTokens.tokenB.id}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            {/if}
                                                        </div>
                                                    </div>
                                                    
                                                    <div class="flex items-center mt-2 md:mt-0">
                                                        <div class="flex-1 h-0.5 bg-gray-200 dark:bg-gray-600"></div>
                                                        <div class="text-gray-500 dark:text-gray-400 px-2">
                                                            <i class="fas fa-{transfer.lpExchangeType === 'add' ? 'arrow-right' : 'arrow-left'}"></i>
                                                        </div>
                                                        <div class="flex-1 h-0.5 bg-gray-200 dark:bg-gray-600"></div>
                                                    </div>
                                                    
                                                    <div class="flex-none">
                                                        <div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            {transfer.lpExchangeType === 'add' ? 'LP Tokens Received' : 'LP Tokens Provided'}
                                                        </div>
                                                        <div class="flex items-center gap-2">
                                                            <div class="w-7 h-7 flex items-center justify-center bg-purple-100 dark:bg-purple-900 rounded-full">
                                                                <i class="fas fa-chart-pie text-purple-600 dark:text-purple-400 text-xs"></i>
                                                            </div>
                                                            <div>
                                                                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                                    {transfer.amount} {token.symbol}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div class="items-center mt-4 justify-center hidden">
                                                    {#if isLPToken(token)}
                                                        {@const poolUrl = getPoolUrl()}
                                                        {#if poolUrl}
                                                            <a 
                                                                href={poolUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                class="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1"
                                                            >
                                                                <i class="fas fa-external-link-alt"></i>
                                                                View Pool Details
                                                            </a>
                                                        {/if}
                                                    {/if}
                                                </div>
                                            {/if}
                                            
                                            <!-- Note Section -->
                                            {#if transfer.note}
                                                <div class="{transfer.isLpExchange && transfer.exchangedTokens && showLPExchangeDetails ? 'mt-3' : ''}">
                                                    <div class="md:pl-[12.5rem] overflow-auto">
                                                        <div class="text-gray-500 dark:text-gray-400 font-medium text-xs">Tx Note</div>
                                                        {#if transfer.isLpExchange && transfer.exchangedTokens}
                                                            <!-- For LP tokens, show truncated text with expand option -->
                                                            <div class="text-gray-600 dark:text-gray-300 text-sm">
                                                                {#if expandedRows.has(transfer.transactionid + '-note')}
                                                                    <!-- Show full note when expanded -->
                                                                    <div class="whitespace-pre-wrap break-words">
                                                                        {transfer.note}
                                                                    </div>
                                                                    <button 
                                                                        class="text-blue-500 hover:text-blue-600 text-xs mt-1 inline-flex items-center gap-1"
                                                                        on:click={() => expandedRows.delete(transfer.transactionid + '-note') && (expandedRows = expandedRows)}
                                                                    >
                                                                        Show less <i class="fas fa-chevron-up"></i>
                                                                    </button>
                                                                {:else}
                                                                    <!-- Show truncated text when collapsed -->
                                                                    <div class="break-words">
                                                                        {transfer.note.length > 100 ? transfer.note.substring(0, 100) : transfer.note}
                                                                        {#if transfer.note.length > 100}
                                                                            <span class="text-gray-400 dark:text-gray-500">...</span>
                                                                        {/if}
                                                                    </div>
                                                                    {#if transfer.note.length > 100}
                                                                        <button 
                                                                            class="text-blue-500 hover:text-blue-600 text-xs mt-1 inline-flex items-center gap-1"
                                                                            on:click={() => expandedRows.add(transfer.transactionid + '-note') && (expandedRows = expandedRows)}
                                                                        >
                                                                            Show more <i class="fas fa-chevron-down"></i>
                                                                        </button>
                                                                    {/if}
                                                                {/if}
                                                            </div>
                                                        {:else}
                                                            <!-- For non-LP tokens, show full note as before -->
                                                            <div class="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap break-words">
                                                                {transfer.note}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                </div>
                                            {/if}
                                        </div>
                                        
                                        <!-- View link consistently positioned at top-right -->
                                        <div class="flex-none ml-4">
                                            <a 
                                                href={`https://explorer.voi.network/explorer/transaction/${transfer.type === 'inner-payment' ? transfer.parentTxId : transfer.transactionid}`}
                                                class="text-blue-500 hover:text-blue-600 transition-colors text-xs inline-flex items-center gap-1"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                View <i class="fas fa-magnifying-glass"></i>
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
            {#if isLoading}
                <div class="flex justify-center items-center py-4">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            {/if}
        </div>
    </div>
</div>
{/if} 

<style>
    .animate-slideDown {
        animation: slideDown 0.2s ease-out;
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style> 