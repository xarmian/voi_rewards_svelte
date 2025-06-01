<script lang="ts">
    import { Modal, Button, Select, Input, Label } from 'flowbite-svelte';
    import type { Recipient } from '$lib/types/recipients';
    import { getEnvoiAddresses, getEnvoiNames } from '$lib/utils/envoi';
    import algosdk from 'algosdk';
    import * as XLSX from 'xlsx';

    export let open = false;
    export let onClose = () => {};
    export let onConfirm = (recipients: Recipient[]) => {};

    const zeroAddress = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

    let error: string | null = null;
    let parsedData: { 
        cells: string[]; 
        isValid: boolean; 
        resolvedAddress?: string;
    }[] = [];
    let addressColumnIndex = 0;
    let amountColumnIndex = -1;
    let noteColumnIndex = -1;
    let columnCount = 0;
    let selectedRows = new Set<number>();
    let allRowsSelected = false;
    let isDragging = false;
    let importStep: 'initial' | 'nft-collection' | 'arc200-token' | 'preview' = 'initial';
    let rawContent = '';
    let showPasteArea = false;
    let collectionId = '';
    let tempCollectionId = '';
    let isLoadingNFTHolders = false;
    let amountType: 'none' | 'per-holder' | 'per-nft' | 'total-pool' = 'none';
    let amountValue = '';
    let roundNumber = '';
    let tempRoundNumber = '';
    let collectionName = '';
    let collectionImageUrl = '';
    let isLoadingCollectionInfo = false;
    let totalTokens = 0;
    let uniqueOwners = 0;
    let currentRound = 0;
    let isCollectionValid = false;
    let collectionError: string | null = null;
    
    // ARC200 token import variables
    let arc200TokenId = '';
    let tempArc200TokenId = '';
    let isLoadingArc200TokenInfo = false;
    let isLoadingArc200Holders = false;
    let arc200TokenName = '';
    let arc200TokenSymbol = '';
    let arc200TokenDecimals = 0;
    let arc200TokenImageUrl = '';
    let arc200TokenHolders = 0;
    let arc200QualifiedHolders = 0;
    let isArc200TokenValid = false;
    let arc200TokenError: string | null = null;
    let arc200DistributionType: 'equal' | 'proportional' | 'per-holder' = 'equal';
    let arc200MinimumBalance = '';

    // Track qualified holders when minimum balance changes
    let arc200TokenData: any = null;
    
    function calculateQualifiedHolders() {
        if (!arc200TokenData || !arc200TokenData.balances) {
            arc200QualifiedHolders = 0;
            return;
        }
        
        const minimumBalance = arc200MinimumBalance ? parseFloat(arc200MinimumBalance) : 0;
        
        if (minimumBalance <= 0) {
            // If no minimum balance, qualified holders equals total holders (excluding zero address and creator)
            arc200QualifiedHolders = arc200TokenHolders;
            return;
        }
        
        try {
            // Get the creator address to exclude
            const creatorAddress = algosdk.getApplicationAddress(parseInt(arc200TokenId));
            
            // Count holders with balance above minimum
            const qualified = arc200TokenData.balances.filter((balance: any) => {
                if (balance.accountId === zeroAddress || balance.accountId === creatorAddress) {
                    return false;
                }
                
                if (balance.balance && balance.balance.startsWith('-')) {
                    return false;
                }
                
                const tokenBalance = Number(balance.balance) / Math.pow(10, balance.decimals);
                return tokenBalance >= minimumBalance;
            }).length;
            
            arc200QualifiedHolders = qualified;
        } catch (err) {
            console.error('Error calculating qualified holders:', err);
            arc200QualifiedHolders = 0;
        }
    }
    
    // Update qualified holders when minimum balance changes
    $: if (arc200TokenData && arc200MinimumBalance !== undefined) {
        calculateQualifiedHolders();
    }

    interface NFTToken {
        contractId: number;
        tokenId: string;
        owner: string;
        isBurned: boolean;
        metadataURI: string | null;
        metadata: string;
        approved: string;
        'mint-round': number;
    }

    $: selectedRowsCount = selectedRows.size;
    $: validRowsCount = parsedData.filter(row => {
        const address = row.cells[addressColumnIndex];
        if (!address) return false;
        if (address.endsWith('.voi')) {
            return row.isValid && row.resolvedAddress;
        }
        return row.isValid && isValidAddressContent(address);
    }).length;
    $: validSelectedRowsCount = [...selectedRows].filter(i => {
        const row = parsedData[i];
        const address = row?.cells[addressColumnIndex];
        if (!address) return false;
        if (address.endsWith('.voi')) {
            return row.isValid && row.resolvedAddress;
        }
        return row.isValid && isValidAddressContent(address);
    }).length;

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        isDragging = true;
    }

    function handleDragLeave() {
        isDragging = false;
    }

    async function handleDrop(event: DragEvent) {
        event.preventDefault();
        isDragging = false;

        const file = event.dataTransfer?.files[0];
        if (!file) return;

        try {
            if (file.name.toLowerCase().endsWith('.xlsx')) {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                rawContent = JSON.stringify(jsonData);
            } else {
                rawContent = await file.text();
            }
            parseContent();
            importStep = 'preview';
        } catch (err) {
            error = 'Failed to read file. Please try again.';
        }
    }

    async function handleFileInput(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        try {
            if (file.name.toLowerCase().endsWith('.xlsx')) {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                rawContent = JSON.stringify(jsonData);
            } else {
                rawContent = await file.text();
            }
            parseContent();
            importStep = 'preview';
        } catch (err) {
            error = 'Failed to read file. Please try again.';
        }
    }

    async function handlePasteFromClipboard() {
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText) {
                showPasteArea = true;
                return;
            }

            // Try parsing the content first
            rawContent = clipboardText;
            const prevParsedData = parsedData;
            parseContent();

            // If no valid addresses found or parsing failed, show paste area
            if (parsedData.length === 0 || !parsedData.some(row => row.isValid)) {
                parsedData = prevParsedData; // Restore previous state
                showPasteArea = true;
                error = 'No valid addresses found in clipboard. Please paste your data manually.';
                return;
            }

            // Content is valid, proceed with import
            importStep = 'preview';
            error = null;
        } catch (err) {
            showPasteArea = true;
            error = 'Failed to read clipboard. Please paste your data manually.';
        }
    }

    function handlePasteContent(event: ClipboardEvent | { currentTarget: HTMLTextAreaElement }) {
        try {
            let text;
            if (event instanceof ClipboardEvent) {
                text = event.clipboardData?.getData('text');
            } else {
                text = event.currentTarget.value;
            }
            
            if (!text) return;
            
            rawContent = text;
            parseContent();
            importStep = 'preview';
            showPasteArea = false;
            error = null;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to parse content';
        }
    }

    function parseContent() {
        try {
            parsedData = parseContentData(rawContent);
            columnCount = Math.max(...parsedData.map(row => row.cells.length), 0);
            autoDetectColumns();
            error = null;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to parse content';
            parsedData = [];
        }
    }

    function parseContentData(content: string) {
        // Try parsing as JSON first
        try {
            const jsonData = JSON.parse(content);
            if (Array.isArray(jsonData)) {
                // Convert JSON array to our expected format
                return jsonData.map(row => {
                    const cells = Object.values(row).map(value => String(value));
                    const isValid = cells.some(cell => isValidAddressContent(cell));
                    return { cells, isValid };
                });
            }
        } catch {
            // If JSON parsing fails, continue with other formats
        }

        const lines = content.trim().split('\n');
        const result: { cells: string[]; isValid: boolean; }[] = [];
        
        // Detect format
        const isMarkdown = lines.some(line => line.trim().startsWith('|'));
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            // Skip markdown table formatting
            if (trimmedLine.startsWith('|-') || trimmedLine.startsWith('+-')) continue;
            
            let cells: string[];
            if (isMarkdown) {
                cells = trimmedLine
                    .split('|')
                    .map(cell => cell.trim())
                    .filter(cell => cell.length > 0);
            } else {
                // Try different delimiters
                if (trimmedLine.includes('\t')) {
                    cells = trimmedLine.split('\t');
                } else if (trimmedLine.includes(',')) {
                    cells = trimmedLine.split(',');
                } else if (trimmedLine.includes(';')) {
                    cells = trimmedLine.split(';');
                } else {
                    cells = [trimmedLine]; // Single column
                }
            }
            
            // Clean cells
            cells = cells.map(cell => cell.trim());
            
            // Skip header-like rows
            if (cells.some(cell => 
                cell.toLowerCase().includes('address') || 
                cell.toLowerCase().includes('wallet') ||
                cell.toLowerCase().includes('amount'))) {
                continue;
            }
            
            // Validate potential address
            const isValid = cells.some(cell => isValidAddressContent(cell));
            
            result.push({ cells, isValid });
        }
        
        return result;
    }

    function isValidAddressContent(content: string): boolean {
        // Skip obviously invalid content
        if (!content || typeof content !== 'string') return false;
        
        const trimmed = content.trim();
        
        // Skip if it's just repeated characters
        if (/^(.)\1+$/.test(trimmed)) return false;
        
        // Skip if it's just hyphens, equals signs, or other common separators
        if (/^[-=_|]+$/.test(trimmed)) return false;
        
        // Skip if it contains obvious non-address characters, but accept .voi addresses
        if (/[^A-Z0-9]/.test(trimmed) && !trimmed.endsWith('.voi')) return false;

        // if address is a .voi address, return true only if it has been resolved
        if (trimmed.endsWith('.voi')) {
            const row = parsedData.find(r => r.cells[addressColumnIndex] === trimmed);
            return !!(row?.isValid && row?.resolvedAddress);
        }

        // Try validating as Algorand address
        try {
            return algosdk.isValidAddress(trimmed);
        } catch {
            return false;
        }
    }

    function autoDetectColumns() {
        // Reset indices
        addressColumnIndex = 0;
        amountColumnIndex = -1;
        noteColumnIndex = -1;
        
        if (parsedData.length === 0) return;
        
        // Try to find address column
        for (let i = 0; i < columnCount; i++) {
            const hasValidAddress = parsedData.some(row => {
                try {
                    return row.cells[i] && algosdk.isValidAddress(row.cells[i]);
                } catch {
                    return false;
                }
            });
            if (hasValidAddress) {
                addressColumnIndex = i;
                break;
            }
        }
        
        // Try to find amount column (looking for numeric values)
        for (let i = 0; i < columnCount; i++) {
            if (i === addressColumnIndex) continue;
            const hasNumericValue = parsedData.some(row => {
                const value = row.cells[i];
                return value && !isNaN(Number(value));
            });
            if (hasNumericValue) {
                amountColumnIndex = i;
                break;
            }
        }

        // Try to find note column (looking for text that contains "note" in column header)
        for (let i = 0; i < columnCount; i++) {
            if (i === addressColumnIndex || i === amountColumnIndex) continue;
            
            // First check the first row for a header with "note"
            const firstRow = parsedData[0]?.cells[i]?.toLowerCase();
            if (firstRow && (firstRow.includes('note') || firstRow.includes('message') || firstRow.includes('memo'))) {
                noteColumnIndex = i;
                // Skip first row for notes since it's a header
                break;
            }
            
            // If no header found, look for a column with string values
            const hasStringValue = parsedData.some((row, index) => {
                if (index === 0) return false; // Skip potential header row
                const value = row.cells[i];
                return value && typeof value === 'string' && value.length > 0 && isNaN(Number(value));
            });
            
            if (hasStringValue) {
                noteColumnIndex = i;
                break;
            }
        }
    }

    function toggleAllRows() {
        const newValue = !allRowsSelected;
        allRowsSelected = newValue;
        selectedRows = new Set(newValue ? parsedData.map((_, i) => i) : []);
    }

    function toggleRow(index: number) {
        const newSelectedRows = new Set(selectedRows);
        if (newSelectedRows.has(index)) {
            newSelectedRows.delete(index);
        } else {
            newSelectedRows.add(index);
        }
        selectedRows = newSelectedRows;
        allRowsSelected = selectedRows.size === parsedData.length;
    }

    async function resolveVoiNames() {
        if (addressColumnIndex < 0) return;
        
        // Reset resolved addresses
        parsedData = parsedData.map(row => ({
            ...row,
            resolvedAddress: undefined,
            isValid: !row.cells[addressColumnIndex]?.endsWith('.voi') && row.isValid // Keep existing validity for non-.voi addresses
        }));

        // Find all .voi names that need resolution
        const voiRows = parsedData.map((row, index) => ({
            index,
            name: row.cells[addressColumnIndex]
        })).filter(row => row.name?.endsWith('.voi'));

        if (voiRows.length === 0) return;

        try {
            // Batch resolve all .voi names in a single API call
            const names = voiRows.map(row => row.name);
            
            // Make the API call directly to get the full response data
            const url = `https://api.envoi.sh/api/address/${names.join(',')}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to resolve .voi names');
            }
            
            const data: { results: { address: string; name: string; }[] } = await response.json();
            
            // Create a map of normalized name to result for efficient lookup
            const resultMap = new Map(
                data.results.map(result => [result.name.toLowerCase(), result])
            );

            // Update each row with its matching result
            voiRows.forEach(({ index, name }) => {
                const result = resultMap.get(name.toLowerCase());
                if (result) {
                    parsedData[index].resolvedAddress = result.address;
                    parsedData[index].isValid = true;
                } else {
                    parsedData[index].isValid = false;
                }
            });
        } catch (err) {
            console.error('Failed to resolve .voi names:', err);
            // Mark all .voi rows as invalid on error
            voiRows.forEach(({ index }) => {
                parsedData[index].isValid = false;
            });
        }

        // Force reactivity update
        parsedData = [...parsedData];
    }

    // Watch for address column changes
    $: if (importStep === 'preview') {
        resolveVoiNames();
    }

    $: if (addressColumnIndex >= 0) {
        resolveVoiNames();
    }

    async function handleConfirm(importAll = false) {
        const recipients: Recipient[] = [];
        const rowsToProcess = importAll 
            ? parsedData
                .map((row, i) => ({ row, i }))
                .filter(({ row }) => {
                    const address = row.cells[addressColumnIndex];
                    if (!address) return false;
                    if (address.endsWith('.voi')) {
                        return row.isValid && row.resolvedAddress;
                    }
                    return row.isValid && isValidAddressContent(address);
                })
                .map(({ i }) => i)
            : [...selectedRows].sort((a, b) => a - b);

        if (!importAll && rowsToProcess.length === 0) {
            error = 'Please select at least one row to import';
            return;
        }

        try {
            for (const i of rowsToProcess) {
                const row = parsedData[i];
                if (!row || !row.cells[addressColumnIndex]) continue;

                const addressOrName = row.cells[addressColumnIndex];
                const amount = amountColumnIndex >= 0 ? row.cells[amountColumnIndex] || '' : '';
                const note = noteColumnIndex >= 0 ? row.cells[noteColumnIndex] || '' : '';

                // Skip invalid rows
                if (addressOrName.endsWith('.voi') && (!row.isValid || !row.resolvedAddress)) {
                    continue;
                }

                if (row.resolvedAddress) {
                    // Use already resolved .voi address
                    recipients.push({
                        address: row.resolvedAddress,
                        amount,
                        note,
                        info: null,
                        isLoading: false,
                        isValid: true
                    });
                } else if (isValidAddressContent(addressOrName)) {
                    recipients.push({
                        address: addressOrName,
                        amount,
                        note,
                        info: null,
                        isLoading: false,
                        isValid: true
                    });
                }
            }

            if (recipients.length === 0) {
                error = 'No valid recipients found';
                return;
            }

            onConfirm(recipients);
            handleClose();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to process recipients';
        }
    }

    function handleClose() {
        error = null;
        collectionError = null;
        arc200TokenError = null;
        selectedRows.clear();
        allRowsSelected = false;
        importStep = 'initial';
        rawContent = '';
        collectionId = '';
        arc200TokenId = '';
        arc200MinimumBalance = '';
        arc200TokenData = null;
        isCollectionValid = false;
        isArc200TokenValid = false;
        onClose();
    }

    async function fetchCollectionInfo(id: string, round?: string) {
        isLoadingCollectionInfo = true;
        collectionName = '';
        collectionImageUrl = '';
        totalTokens = 0;
        uniqueOwners = 0;
        currentRound = 0;
        isCollectionValid = false;
        collectionError = null;
        
        try {
            const url = new URL('https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/tokens');
            url.searchParams.set('contractId', id);
            if (round && !isNaN(Number(round))) {
                url.searchParams.set('round', round);
            }

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error('Failed to fetch collection info');
            }

            const data = await response.json();
            if (!data.tokens || !Array.isArray(data.tokens) || data.tokens.length === 0) {
                throw new Error('No tokens found for this collection');
            }

            currentRound = data.currentRound || 0;

            // Get first token for collection info
            const firstToken = data.tokens[0];
            if (firstToken.metadataURI && firstToken.metadata) {
                const metadata = JSON.parse(firstToken.metadata);
                if (metadata.name) {
                    // Extract base name by removing number/index
                    collectionName = metadata.name.replace(/[#\d]+$/, '').trim();
                }
                if (metadata.image) {
                    // Handle IPFS URLs
                    collectionImageUrl = metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/');
                }
            }

            // Calculate collection stats
            const validTokens = data.tokens.filter((token: NFTToken) => !token.isBurned && token.owner !== zeroAddress);
            totalTokens = validTokens.length;
            
            // Count unique owners
            const owners = new Set(validTokens.map((token: NFTToken) => token.owner));
            uniqueOwners = owners.size;

            // Mark collection as valid if it has tokens and owners
            isCollectionValid = totalTokens > 0 && uniqueOwners > 0;

        } catch (err) {
            console.error('Failed to fetch collection info:', err);
            collectionError = err instanceof Error ? err.message : 'Failed to fetch collection info';
            isCollectionValid = false;
        } finally {
            isLoadingCollectionInfo = false;
        }
    }

    // Remove the reactive statement for collectionId
    function handleCollectionIdChange(event: Event) {
        const input = event.target as HTMLInputElement;
        const newId = input.value;
        tempCollectionId = newId;
    }

    function handleCollectionIdBlur() {
        if (tempCollectionId !== collectionId) {
            collectionId = tempCollectionId;
            const id = collectionId.includes('nftnavigator.xyz/collection/') 
                ? collectionId.split('collection/')[1].split(/[^0-9]/)[0]
                : collectionId;
            
            if (id && !isNaN(Number(id)) && id.length >= 6) {
                fetchCollectionInfo(id, roundNumber);
            } else {
                collectionName = '';
                collectionImageUrl = '';
                isCollectionValid = false;
                
                if (collectionId.trim()) {
                    collectionError = 'Invalid collection ID format';
                } else {
                    collectionError = null;
                }
            }
        }
    }

    function handleRoundNumberChange(event: Event) {
        const input = event.target as HTMLInputElement;
        tempRoundNumber = input.value;
    }

    function handleRoundNumberBlur() {
        if (tempRoundNumber !== roundNumber) {
            roundNumber = tempRoundNumber;
            if (collectionId) {
                const id = collectionId.includes('nftnavigator.xyz/collection/') 
                    ? collectionId.split('collection/')[1].split(/[^0-9]/)[0]
                    : collectionId;
                
                if (id && !isNaN(Number(id)) && id.length >= 6) {
                    fetchCollectionInfo(id, roundNumber);
                }
            }
        }
    }

    // ARC200 Token Holder functions
    function handleArc200TokenIdChange(event: Event) {
        const input = event.target as HTMLInputElement;
        const newId = input.value;
        tempArc200TokenId = newId;
    }

    function handleArc200TokenIdBlur() {
        if (tempArc200TokenId !== arc200TokenId) {
            arc200TokenId = tempArc200TokenId;
            
            if (arc200TokenId && !isNaN(Number(arc200TokenId))) {
                fetchArc200TokenInfo(arc200TokenId);
            } else {
                arc200TokenName = '';
                arc200TokenSymbol = '';
                arc200TokenImageUrl = '';
                isArc200TokenValid = false;
                
                if (arc200TokenId.trim()) {
                    arc200TokenError = 'Invalid token ID format';
                } else {
                    arc200TokenError = null;
                }
            }
        }
    }

    async function fetchArc200TokenInfo(id: string) {
        isLoadingArc200TokenInfo = true;
        arc200TokenName = '';
        arc200TokenSymbol = '';
        arc200TokenDecimals = 0;
        arc200TokenImageUrl = '';
        arc200TokenHolders = 0;
        arc200QualifiedHolders = 0;
        isArc200TokenValid = false;
        arc200TokenError = null;
        arc200TokenData = null;
        
        try {
            // Create a complete holders list with pagination support
            const allBalances = [];
            let nextToken = null;
            let pageCount = 0;
            const limit = 1000;
            
            do {
                // Build URL with pagination parameters
                const url = new URL(`https://voi-mainnet-mimirapi.nftnavigator.xyz/arc200/balances`);
                url.searchParams.set('contractId', id);
                url.searchParams.set('limit', limit.toString());
                if (nextToken) {
                    url.searchParams.set('next-token', nextToken);
                }
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error('Failed to fetch token info');
                }

                const data = await response.json();
                if (!data.balances || !Array.isArray(data.balances)) {
                    throw new Error('Invalid response from API');
                }
                
                // Add balances from this page to our collection
                allBalances.push(...data.balances);
                
                // Get next token for pagination
                nextToken = data['next-token'];
                pageCount++;
                
                // Safety check to prevent infinite loops
                if (pageCount > 10) {
                    console.warn('Stopped pagination after 10 pages to prevent infinite loop');
                    break;
                }
            } while (nextToken);
            
            // Create a complete data object with all balances
            const completeData = {
                balances: allBalances
            };
            
            if (allBalances.length === 0) {
                throw new Error('No token holders found');
            }

            // Store the raw token data for later filtering
            arc200TokenData = completeData;

            // Get token info from the first balance
            const firstBalance = allBalances[0];
            arc200TokenName = firstBalance.name || '';
            arc200TokenSymbol = firstBalance.symbol || '';
            arc200TokenDecimals = firstBalance.decimals || 0;
            arc200TokenImageUrl = firstBalance.imageUrl || '';
            
            // Get creator address to exclude
            const creatorAddress = algosdk.getApplicationAddress(parseInt(id));
            
            // Count valid holders (excluding zero address and creator)
            arc200TokenHolders = allBalances.filter((balance: any) => 
                balance.accountId !== zeroAddress && 
                balance.accountId !== creatorAddress &&
                balance.balance && 
                !balance.balance.startsWith('-')
            ).length;

            // Initially, qualified holders equals total holders
            arc200QualifiedHolders = arc200TokenHolders;

            // Mark token as valid if it has holders
            isArc200TokenValid = arc200TokenHolders > 0;
            
            // Calculate qualified holders based on current minimum balance
            calculateQualifiedHolders();

        } catch (err) {
            console.error('Failed to fetch token info:', err);
            arc200TokenError = err instanceof Error ? err.message : 'Failed to fetch token info';
            isArc200TokenValid = false;
            arc200TokenData = null;
        } finally {
            isLoadingArc200TokenInfo = false;
        }
    }

    async function handleArc200TokenImport() {
        if (!arc200TokenId) {
            error = 'Please enter a token ID';
            return;
        }

        if (!isArc200TokenValid) {
            error = 'Invalid token ID or no holders found';
            return;
        }

        if (arc200DistributionType === 'per-holder' && (!amountValue || isNaN(Number(amountValue)) || Number(amountValue) <= 0)) {
            error = 'Please enter a valid amount';
            return;
        }

        if (arc200DistributionType === 'proportional' && (!amountValue || isNaN(Number(amountValue)) || Number(amountValue) <= 0)) {
            error = 'Please enter a valid total amount for the pool';
            return;
        }

        // Parse minimum balance if specified
        const minimumBalance = arc200MinimumBalance ? parseFloat(arc200MinimumBalance) : 0;
        if (arc200MinimumBalance && (isNaN(minimumBalance) || minimumBalance < 0)) {
            error = 'Please enter a valid minimum balance';
            return;
        }

        isLoadingArc200Holders = true;
        error = null;

        try {
            // If we already have the token data, use it instead of fetching again
            let validHolders = [];
            
            if (arc200TokenData && arc200TokenData.balances) {
                // Get the creator address to exclude it
                const creatorAddress = algosdk.getApplicationAddress(parseInt(arc200TokenId));
                
                // Filter out zero address, creator address, negative balances, and balances below minimum
                validHolders = arc200TokenData.balances.filter((balance: any) => {
                    // Skip zero address and creator address
                    if (balance.accountId === zeroAddress || balance.accountId === creatorAddress) {
                        return false;
                    }
                    
                    // Skip negative balances
                    if (balance.balance && balance.balance.startsWith('-')) {
                        return false;
                    }
                    
                    // Apply minimum balance filter if specified
                    if (minimumBalance > 0) {
                        const tokenBalance = Number(balance.balance) / Math.pow(10, balance.decimals);
                        return tokenBalance >= minimumBalance;
                    }
                    
                    return true;
                });
            } else {
                // We need to fetch the data with pagination
                const allBalances = [];
                let nextToken = null;
                let pageCount = 0;
                const limit = 1000;
                
                do {
                    // Build URL with pagination parameters
                    const url = new URL(`https://voi-mainnet-mimirapi.nftnavigator.xyz/arc200/balances`);
                    url.searchParams.set('contractId', arc200TokenId);
                    url.searchParams.set('limit', limit.toString());
                    if (nextToken) {
                        url.searchParams.set('next-token', nextToken);
                    }
                    
                    const response = await fetch(url.toString());
                    if (!response.ok) {
                        throw new Error('Failed to fetch token holders');
                    }

                    const data = await response.json();
                    if (!data.balances || !Array.isArray(data.balances)) {
                        throw new Error('Invalid response from API');
                    }
                    
                    // Add balances from this page to our collection
                    allBalances.push(...data.balances);
                    
                    // Get next token for pagination
                    nextToken = data['next-token'];
                    pageCount++;
                    
                    // Safety check to prevent infinite loops
                    if (pageCount > 10) {
                        console.warn('Stopped pagination after 10 pages to prevent infinite loop');
                        break;
                    }
                } while (nextToken);
                
                // Get the creator address to exclude it
                const creatorAddress = algosdk.getApplicationAddress(parseInt(arc200TokenId));
                
                // Filter out zero address, creator address, negative balances, and balances below minimum
                validHolders = allBalances.filter((balance: any) => {
                    // Skip zero address and creator address
                    if (balance.accountId === zeroAddress || balance.accountId === creatorAddress) {
                        return false;
                    }
                    
                    // Skip negative balances
                    if (balance.balance && balance.balance.startsWith('-')) {
                        return false;
                    }
                    
                    // Apply minimum balance filter if specified
                    if (minimumBalance > 0) {
                        const tokenBalance = Number(balance.balance) / Math.pow(10, balance.decimals);
                        return tokenBalance >= minimumBalance;
                    }
                    
                    return true;
                });
            }

            if (validHolders.length === 0) {
                throw new Error('No valid holders found for this token');
            }

            // Calculate total tokens for proportional distribution if needed
            let totalTokenAmount = 0;
            
            if (arc200DistributionType === 'proportional') {
                // Sum all balances for proportional distribution
                totalTokenAmount = validHolders.reduce((sum: number, holder: any) => {
                    const balance = Number(holder.balance) / Math.pow(10, holder.decimals);
                    return sum + balance;
                }, 0);
            }

            // Create recipients array
            const recipients: Recipient[] = [];
            
            validHolders.forEach((holder: any) => {
                let amount = '';
                const holderBalance = Number(holder.balance) / Math.pow(10, holder.decimals);
                
                if (arc200DistributionType !== 'equal') {
                    if (arc200DistributionType === 'per-holder') {
                        amount = amountValue;
                    } else if (arc200DistributionType === 'proportional' && totalTokenAmount > 0) {
                        // Calculate proportional amount based on holder's percentage of total
                        const percentage = holderBalance / totalTokenAmount;
                        amount = (Number(amountValue) * percentage).toFixed(8);
                    }
                } else {
                    // Equal distribution (amount will be calculated by the recipient table)
                    amount = '';
                }
                
                recipients.push({
                    address: holder.accountId,
                    amount,
                    note: '',
                    info: null,
                    isLoading: false,
                    isValid: true
                });
            });

            onConfirm(recipients);
            handleClose();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to fetch token holders';
        } finally {
            isLoadingArc200Holders = false;
        }
    }

    async function handleNFTCollectionImport() {
        if (!collectionId) {
            error = 'Please enter a collection ID';
            return;
        }

        // Extract collection ID from URL if needed
        const id = collectionId.includes('nftnavigator.xyz/collection/') 
            ? collectionId.split('collection/')[1].split(/[^0-9]/)[0]
            : collectionId;

        if (!id || isNaN(Number(id))) {
            error = 'Invalid collection ID';
            return;
        }

        if (amountType !== 'none' && (!amountValue || isNaN(Number(amountValue)) || Number(amountValue) <= 0)) {
            error = 'Please enter a valid amount';
            return;
        }

        if (roundNumber && (isNaN(Number(roundNumber)) || Number(roundNumber) <= 0)) {
            error = 'Please enter a valid round number';
            return;
        }

        isLoadingNFTHolders = true;
        error = null;

        try {
            const url = new URL('https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/tokens');
            url.searchParams.set('contractId', id);
            if (roundNumber) {
                url.searchParams.set('round', roundNumber);
            }

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error('Failed to fetch NFT holders');
            }

            const data = await response.json();
            if (!data.tokens || !Array.isArray(data.tokens)) {
                throw new Error('Invalid response from NFT indexer');
            }

            // Create a map to count NFTs per holder
            const holdersMap = new Map<string, number>();
            data.tokens.forEach((token: NFTToken) => {
                if (!token.isBurned && token.owner && token.owner !== zeroAddress) {
                    holdersMap.set(token.owner, (holdersMap.get(token.owner) || 0) + 1);
                }
            });

            // Calculate total NFTs for total-pool distribution if needed
            let totalNFTCount = 0;
            let amountPerNFT = 0;
            
            if (amountType === 'total-pool') {
                // Count total NFTs (excluding burned and zero address)
                totalNFTCount = Array.from(holdersMap.values()).reduce((sum, count) => sum + count, 0);
                
                // Calculate amount per NFT
                if (totalNFTCount > 0) {
                    amountPerNFT = Number(amountValue) / totalNFTCount;
                }
            }

            // Create recipients array directly instead of using parsedData
            const recipients: Recipient[] = [];
            
            Array.from(holdersMap.entries()).forEach(([address, count]) => {
                let amount = '';
                
                if (amountType !== 'none') {
                    if (amountType === 'per-holder') {
                        amount = amountValue;
                    } else if (amountType === 'per-nft') {
                        amount = (Number(amountValue) * count).toString();
                    } else if (amountType === 'total-pool') {
                        amount = (amountPerNFT * count).toFixed(8);
                    }
                }
                
                // Add empty note field for consistency
                recipients.push({
                    address,
                    amount,
                    note: '',
                    info: null,
                    isLoading: false,
                    isValid: true
                });
            });

            if (recipients.length === 0) {
                throw new Error('No valid holders found for this collection');
            }

            onConfirm(recipients);
            handleClose();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to fetch NFT holders';
        } finally {
            isLoadingNFTHolders = false;
        }
    }
</script>

<Modal 
    bind:open 
    size="xl" 
    on:close={handleClose} 
    class="w-full h-full flex items-center" 
    data-modal-import
>
    <div class="w-full flex flex-col max-h-[calc(100vh-4rem)]">
        <div class="flex-none">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                    Import Recipients
                </h3>
                {#if importStep === 'preview'}
                    <div class="flex items-center gap-4">
                        <div class="text-sm text-gray-500">
                            {parsedData.length} rows found
                        </div>
                        <Button 
                            color="light" 
                            size="sm"
                            on:click={() => {
                                importStep = 'initial';
                                parsedData = [];
                                selectedRows.clear();
                                allRowsSelected = false;
                                error = null;
                                rawContent = '';
                            }}
                        >
                            <i class="fas fa-redo-alt mr-2"></i>
                            Clear & Re-import
                        </Button>
                    </div>
                {/if}
            </div>

            {#if error}
                <div class="p-4 mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>{error}</span>
                    </div>
                </div>
            {/if}

            {#if importStep === 'preview'}
                <div class="mb-6 grid grid-cols-2 gap-4">
                    <div>
                        <label for="address-column" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Address Column
                        </label>
                        <Select 
                            class="w-full"
                            bind:value={addressColumnIndex}
                        >
                            {#each Array(columnCount) as _, i}
                                <option value={i}>Column {i + 1}</option>
                            {/each}
                        </Select>
                    </div>
                    <div>
                        <label for="amount-column" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Amount Column (Optional)
                        </label>
                        <Select 
                            class="w-full"
                            bind:value={amountColumnIndex}
                        >
                            <option value={-1}>None</option>
                            {#each Array(columnCount) as _, i}
                                {#if i !== addressColumnIndex}
                                    <option value={i}>Column {i + 1}</option>
                                {/if}
                            {/each}
                        </Select>
                    </div>
                </div>
            {/if}
        </div>

        <div class="flex-1 min-h-0 overflow-auto">
            {#if importStep === 'initial'}
                <div 
                    class="h-96 border-2 border-dashed rounded-lg p-8 text-center flex items-center justify-center {isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700'}"
                    role="button"
                    tabindex="0"
                    on:dragover={handleDragOver}
                    on:dragleave={handleDragLeave}
                    on:drop={handleDrop}
                >
                    {#if showPasteArea}
                        <div class="w-full max-w-4xl mx-auto space-y-4">
                            <div class="text-gray-500 dark:text-gray-400">
                                <p class="text-lg mb-2">Paste Your Data</p>
                                <p class="text-sm">Paste your data below or press Ctrl+V (Cmd+V on Mac)</p>
                            </div>
                            <textarea
                                class="w-full h-48 p-3 text-sm font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
                                placeholder="Paste your data here..."
                                on:paste={handlePasteContent}
                                on:input={(e) => handlePasteContent(e)}
                            ></textarea>
                            <div class="flex justify-end gap-3">
                                <Button 
                                    color="alternative" 
                                    on:click={() => {
                                        showPasteArea = false;
                                        error = null;
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    {:else}
                        <div class="w-full max-w-lg mx-auto space-y-6">
                            <div class="text-gray-500 dark:text-gray-400">
                                <i class="fas fa-file-import text-4xl mb-4"></i>
                                <p class="text-lg mb-2">Import Recipients</p>
                                <p class="text-sm">Drag and drop a file here, or choose an import method below</p>
                            </div>
                            
                            <div class="flex flex-col gap-3">
                                <div>
                                    <input 
                                        type="file" 
                                        id="file-upload" 
                                        class="hidden" 
                                        accept=".txt,.csv,.md,.json,.xlsx"
                                        on:change={handleFileInput}
                                    />
                                    <Button 
                                        color="light" 
                                        class="w-full"
                                        on:click={() => document.getElementById('file-upload')?.click()}
                                    >
                                        <i class="fas fa-folder-open mr-2"></i>
                                        Choose File
                                    </Button>
                                </div>
                                <Button 
                                    color="light" 
                                    class="w-full"
                                    on:click={handlePasteFromClipboard}
                                >
                                    <i class="fas fa-paste mr-2"></i>
                                    Paste from Clipboard
                                </Button>
                                <Button 
                                    color="light" 
                                    class="w-full"
                                    on:click={() => {
                                        error = null;
                                        importStep = 'nft-collection';
                                    }}
                                >
                                    <i class="fas fa-users mr-2"></i>
                                    Import NFT Collection Holders
                                </Button>
                                <Button 
                                    color="light" 
                                    class="w-full"
                                    on:click={() => {
                                        error = null;
                                        importStep = 'arc200-token';
                                    }}
                                >
                                    <i class="fas fa-coins mr-2"></i>
                                    Import ARC200 Token Holders
                                </Button>
                            </div>

                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                Supported formats: CSV, TSV, TXT, XLSX, Markdown tables, or JSON arrays
                            </p>
                        </div>
                    {/if}
                </div>
            {:else if importStep === 'nft-collection'}
                <div class="flex items-center justify-center place-self-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg px-8 py-8 sm:px-28 text-center">
                    <div class="w-full max-w-lg mx-auto space-y-6">
                        <div class="text-gray-500 dark:text-gray-400">
                            <i class="fas fa-users text-4xl mb-4"></i>
                            <p class="text-lg mb-2">Import NFT Collection Holders</p>
                            <p class="text-sm">Enter a collection ID or paste an <a href="https://nftnavigator.xyz/" target="_blank" class="text-blue-500">NFT Navigator</a> collection URL</p>
                        </div>
                        
                        <div class="space-y-6">
                            <div>
                                <Label for="collection-id">Collection ID or URL</Label>
                                <div class="flex items-center gap-2">
                                    <Input
                                        id="collection-id"
                                        type="text"
                                        placeholder="398078 or https://nftnavigator.xyz/collection/398078"
                                        value={tempCollectionId}
                                        on:input={handleCollectionIdChange}
                                        on:change={handleCollectionIdBlur}
                                    />
                                    {#if isLoadingCollectionInfo}
                                        <div class="text-center py-4">
                                            <i class="fas fa-spinner fa-spin text-gray-500"></i>
                                        </div>
                                    {/if}
                                </div>
                            </div>

                            {#if collectionError && collectionId.trim() && !isLoadingCollectionInfo}
                                <div class="p-3 text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-exclamation-circle"></i>
                                        <span>{collectionError}</span>
                                    </div>
                                </div>
                            {/if}

                            {#if collectionName || collectionImageUrl}
                                <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900/40 hover:outline hover:outline-gray-300 dark:hover:outline-gray-700">
                                    <a href={`https://nftnavigator.xyz/collection/${collectionId.includes('collection/') ? collectionId.split('collection/')[1].split(/[^0-9]/)[0] : collectionId}`} target="_blank" class="flex items-start gap-4">
                                        <div class="flex items-start gap-4">
                                        {#if collectionImageUrl}
                                            <img 
                                                src={collectionImageUrl} 
                                                alt="Collection Preview"
                                                class="w-16 h-16 rounded-lg object-cover"
                                            />
                                        {/if}
                                        {#if collectionName}
                                            <div class="flex-1">
                                                <h4 class="font-medium text-gray-900 dark:text-white">
                                                    {collectionName}
                                                </h4>
                                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                                    Collection #{collectionId.includes('collection/') ? collectionId.split('collection/')[1].split(/[^0-9]/)[0] : collectionId}
                                                </p>
                                                <div class="flex gap-4 mt-2 text-sm justify-center">
                                                    <div>
                                                        <span class="font-medium text-gray-900 dark:text-white">{totalTokens}</span>
                                                        <span class="text-gray-500 dark:text-gray-400"> tokens</span>
                                                    </div>
                                                    <div>
                                                        <span class="font-medium text-gray-900 dark:text-white">{uniqueOwners}</span>
                                                        <span class="text-gray-500 dark:text-gray-400"> unique owners</span>
                                                    </div>
                                                </div>
                                            </div>
                                        {/if}
                                    </div>
                                </a>
                                </div>
                            {/if}

                            <div>
                                <Label for="round-number">Round Number (Optional)</Label>
                                <Input
                                    id="round-number"
                                    type="number"
                                    placeholder="Leave empty for current round"
                                    value={tempRoundNumber}
                                    on:input={handleRoundNumberChange}
                                    on:change={handleRoundNumberBlur}
                                />
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {#if currentRound}
                                        Current round is {currentRound.toLocaleString()}
                                    {:else}
                                        Specify a round number to get historical holder data
                                    {/if}
                                </p>
                            </div>

                            <div class="space-y-2">
                                <Label>Distribution Amount (Optional)</Label>
                                <div class="flex gap-2">
                                    <Button 
                                        color={amountType === 'none' ? 'blue' : 'light'}
                                        size="sm"
                                        on:click={() => {
                                            amountType = 'none';
                                            amountValue = '';
                                        }}
                                    >
                                        No Amount
                                    </Button>
                                    <Button 
                                        color={amountType === 'per-holder' ? 'blue' : 'light'}
                                        size="sm"
                                        on:click={() => amountType = 'per-holder'}
                                    >
                                        Per Holder
                                    </Button>
                                    <Button 
                                        color={amountType === 'per-nft' ? 'blue' : 'light'}
                                        size="sm"
                                        on:click={() => amountType = 'per-nft'}
                                    >
                                        Per NFT
                                    </Button>
                                    <Button 
                                        color={amountType === 'total-pool' ? 'blue' : 'light'}
                                        size="sm"
                                        on:click={() => amountType = 'total-pool'}
                                    >
                                        Total Pool
                                    </Button>
                                </div>
                                {#if amountType !== 'none'}
                                    <div class="mt-2">
                                        <Input
                                            type="number"
                                            placeholder={
                                                amountType === 'per-holder' 
                                                ? 'Amount per holder' 
                                                : amountType === 'per-nft'
                                                  ? 'Amount per NFT'
                                                  : 'Total amount to distribute'
                                            }
                                            bind:value={amountValue}
                                        />
                                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            {#if amountType === 'per-holder'}
                                                Each holder will receive this amount
                                            {:else if amountType === 'per-nft'}
                                                Amount will be multiplied by the number of NFTs held
                                            {:else}
                                                Total amount will be divided equally among all NFTs
                                            {/if}
                                        </p>
                                    </div>
                                {/if}
                            </div>
                            
                            <div class="flex justify-end gap-3">
                                <Button 
                                    color="alternative" 
                                    on:click={() => {
                                        importStep = 'initial';
                                        collectionId = '';
                                        collectionError = null;
                                        error = null;
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    color="blue"
                                    disabled={isLoadingNFTHolders || !isCollectionValid}
                                    on:click={handleNFTCollectionImport}
                                    class={!isCollectionValid && !isLoadingNFTHolders ? 'relative group' : ''}
                                >
                                    {#if isLoadingNFTHolders}
                                        <i class="fas fa-spinner fa-spin mr-2"></i>
                                        Loading...
                                    {:else}
                                        Import Holders
                                    {/if}
                                    
                                    {#if !isCollectionValid && !isLoadingNFTHolders && collectionId.trim()}
                                        <div class="hidden group-hover:block absolute -top-10 left-1/2 transform -translate-x-1/2 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg">
                                            Please select a valid NFT collection first
                                        </div>
                                    {/if}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            {:else if importStep === 'arc200-token'}
                <div class="flex items-center justify-center place-self-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg px-8 py-8 sm:px-28 text-center">
                    <div class="w-full max-w-lg mx-auto space-y-6">
                        <div class="text-gray-500 dark:text-gray-400">
                            <i class="fas fa-coins text-4xl mb-4"></i>
                            <p class="text-lg mb-2">Import ARC200 Token Holders</p>
                            <p class="text-sm">Enter an ARC200 token ID</p>
                        </div>
                        
                        <div class="space-y-6">
                            <div>
                                <Label for="arc200-token-id">Token ID</Label>
                                <div class="flex items-center gap-2">
                                    <Input
                                        id="arc200-token-id"
                                        type="text"
                                        placeholder="770561"
                                        value={tempArc200TokenId}
                                        on:input={handleArc200TokenIdChange}
                                        on:change={handleArc200TokenIdBlur}
                                    />
                                    {#if isLoadingArc200TokenInfo}
                                        <div class="text-center py-4">
                                            <i class="fas fa-spinner fa-spin text-gray-500"></i>
                                        </div>
                                    {/if}
                                </div>
                            </div>

                            {#if arc200TokenError && arc200TokenId.trim() && !isLoadingArc200TokenInfo}
                                <div class="p-3 text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-exclamation-circle"></i>
                                        <span>{arc200TokenError}</span>
                                    </div>
                                </div>
                            {/if}

                            {#if arc200TokenName || arc200TokenSymbol}
                                <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900/40 hover:outline hover:outline-gray-300 dark:hover:outline-gray-700">
                                    <div class="flex items-start gap-4">
                                        {#if arc200TokenImageUrl}
                                            <img 
                                                src={arc200TokenImageUrl} 
                                                alt="Token Icon"
                                                class="w-16 h-16 rounded-lg object-cover"
                                            />
                                        {/if}
                                        <div class="flex-1">
                                            <h4 class="font-medium text-gray-900 dark:text-white">
                                                {arc200TokenName} {arc200TokenSymbol ? `(${arc200TokenSymbol})` : ''}
                                            </h4>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                                Token ID: {arc200TokenId}
                                            </p>
                                            <div class="flex gap-4 mt-2 text-sm justify-center">
                                                <div>
                                                    <span class="font-medium text-gray-900 dark:text-white">{arc200TokenHolders}</span>
                                                    <span class="text-gray-500 dark:text-gray-400"> unique holders</span>
                                                </div>
                                                <div>
                                                    <span class="font-medium text-gray-900 dark:text-white">{arc200TokenDecimals}</span>
                                                    <span class="text-gray-500 dark:text-gray-400"> decimals</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/if}

                            <div class="space-y-2">
                                <Label>Distribution Amount (Optional)</Label>
                                <div class="flex gap-2">
                                    <Button 
                                        color={arc200DistributionType === 'equal' ? 'blue' : 'light'}
                                        size="sm"
                                        on:click={() => {
                                            arc200DistributionType = 'equal';
                                            amountValue = '';
                                        }}
                                    >
                                        No Amount
                                    </Button>
                                    <Button 
                                        color={arc200DistributionType === 'per-holder' ? 'blue' : 'light'}
                                        size="sm"
                                        on:click={() => arc200DistributionType = 'per-holder'}
                                    >
                                        Per Holder
                                    </Button>
                                    <Button 
                                        color={arc200DistributionType === 'proportional' ? 'blue' : 'light'}
                                        size="sm"
                                        on:click={() => arc200DistributionType = 'proportional'}
                                    >
                                        Proportional
                                    </Button>
                                </div>
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {#if arc200DistributionType === 'equal'}
                                        All holders receive an equal distribution
                                    {:else if arc200DistributionType === 'per-holder'}
                                        Each holder receives the same amount
                                    {:else if arc200DistributionType === 'proportional'}
                                        Distribution based on percentage of holdings
                                    {/if}
                                </p>

                                {#if arc200DistributionType !== 'equal'}
                                    <div class="mt-2">
                                        <Label for="arc200-amount-value">
                                            {arc200DistributionType === 'per-holder' ? 'Amount per holder' : 'Total pool amount'}
                                        </Label>
                                        <Input
                                            id="arc200-amount-value"
                                            type="number"
                                            placeholder={
                                                arc200DistributionType === 'per-holder' 
                                                ? 'Amount per holder' 
                                                : 'Total amount to distribute'
                                            }
                                            bind:value={amountValue}
                                        />
                                    </div>
                                {/if}
                            </div>

                            <div>
                                <Label for="arc200-min-balance">Minimum Balance (Optional)</Label>
                                <Input
                                    id="arc200-min-balance"
                                    type="number"
                                    placeholder="Minimum token balance to include"
                                    bind:value={arc200MinimumBalance}
                                />
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Only include holders with at least this many tokens
                                    {#if arc200TokenData && arc200TokenHolders > 0}
                                        {#if arc200MinimumBalance && parseFloat(arc200MinimumBalance) > 0}
                                            <span class="ml-1 font-medium">
                                                ({arc200QualifiedHolders} of {arc200TokenHolders} holders qualify)
                                            </span>
                                        {:else}
                                            <span class="ml-1 font-medium">
                                                ({arc200TokenHolders} holders)
                                            </span>
                                        {/if}
                                    {/if}
                                </p>
                            </div>
                            
                            <div class="flex justify-end gap-3">
                                <Button 
                                    color="alternative" 
                                    on:click={() => {
                                        importStep = 'initial';
                                        arc200TokenId = '';
                                        arc200TokenError = null;
                                        error = null;
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    color="blue"
                                    disabled={isLoadingArc200Holders || !isArc200TokenValid}
                                    on:click={handleArc200TokenImport}
                                    class={!isArc200TokenValid && !isLoadingArc200Holders ? 'relative group' : ''}
                                >
                                    {#if isLoadingArc200Holders}
                                        <i class="fas fa-spinner fa-spin mr-2"></i>
                                        Loading...
                                    {:else}
                                        Import Holders
                                    {/if}
                                    
                                    {#if !isArc200TokenValid && !isLoadingArc200Holders && arc200TokenId.trim()}
                                        <div class="hidden group-hover:block absolute -top-10 left-1/2 transform -translate-x-1/2 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg">
                                            Please select a valid ARC200 token first
                                        </div>
                                    {/if}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            {:else}
                <div class="h-full border dark:border-gray-700 rounded-lg overflow-hidden">
                    <div class="h-full overflow-auto">
                        <table class="w-full text-sm text-left">
                            <thead class="text-xs uppercase bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                                <tr>
                                    <th class="p-4 bg-gray-50 dark:bg-gray-900/50">
                                        <div class="flex items-center">
                                            <input
                                                type="checkbox"
                                                class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
                                                checked={allRowsSelected}
                                                on:change={toggleAllRows}
                                            >
                                        </div>
                                    </th>
                                    {#each Array(columnCount) as _, i}
                                        <th class="px-4 py-3 font-medium bg-gray-50 dark:bg-gray-900/50">
                                            <div class="flex items-center gap-2">
                                                <span>Column {i + 1}</span>
                                                {#if i === addressColumnIndex}
                                                    <span class="text-xs font-normal text-gray-500">(Address)</span>
                                                {:else if i === amountColumnIndex}
                                                    <span class="text-xs font-normal text-gray-500">(Amount)</span>
                                                {:else if i === noteColumnIndex}
                                                    <span class="text-xs font-normal text-gray-500">(Note)</span>
                                                {/if}
                                            </div>
                                        </th>
                                    {/each}
                                </tr>
                            </thead>
                            <tbody class="divide-y dark:divide-gray-700">
                                {#each parsedData as row, i}
                                    <tr class="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td class="p-4">
                                            <div class="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:focus:ring-blue-600"
                                                    checked={selectedRows.has(i)}
                                                    on:change={() => toggleRow(i)}
                                                >
                                                {#if !isValidAddressContent(row.cells[addressColumnIndex])}
                                                    <i class="fas fa-ban text-red-500 dark:text-red-400" title="This row will be skipped during import due to invalid address"></i>
                                                {/if}
                                            </div>
                                        </td>
                                        {#each Array(columnCount) as _, j}
                                            <td class="px-4 py-3 font-mono">
                                                {#if j === addressColumnIndex && row.cells[j]}
                                                    <div class="flex flex-col gap-1">
                                                        <div class="flex items-center gap-2">
                                                            <span class={!row.isValid ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-900 dark:text-white'}>
                                                                {row.cells[j]}
                                                            </span>
                                                            {#if !row.isValid}
                                                                <i class="fas fa-exclamation-circle text-red-600 dark:text-red-400" title="Invalid address format"></i>
                                                            {/if}
                                                        </div>
                                                        {#if row.cells[j].endsWith('.voi')}
                                                            {#if row.resolvedAddress}
                                                                <div class="text-xs text-gray-500 dark:text-gray-400 font-normal">
                                                                    {row.resolvedAddress.slice(0, 8)}...{row.resolvedAddress.slice(-8)}
                                                                </div>
                                                            {:else}
                                                                <div class="text-xs text-gray-500 dark:text-gray-400 font-normal">
                                                                    Resolving...
                                                                </div>
                                                            {/if}
                                                        {/if}
                                                    </div>
                                                {:else}
                                                    <span class="text-gray-600 dark:text-gray-400">
                                                        {row.cells[j] || ''}
                                                    </span>
                                                {/if}
                                            </td>
                                        {/each}
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {/if}
        </div>

        <div class="flex-none mt-6 pt-4 border-t dark:border-gray-700">
            <div class="flex justify-end gap-3">
                <Button color="alternative" on:click={handleClose}>Cancel Import</Button>
                {#if importStep === 'preview'}
                    <Button 
                        color="light"
                        on:click={() => handleConfirm(true)}
                        disabled={validRowsCount === 0}
                    >
                        Import All ({validRowsCount})
                    </Button>
                    <Button 
                        color="blue" 
                        on:click={() => handleConfirm(false)}
                        disabled={validSelectedRowsCount === 0}
                    >
                        Import Selected ({validSelectedRowsCount})
                    </Button>
                {/if}
            </div>
        </div>
    </div>
</Modal>

<style>
    /* Add custom scrollbar styling */
    :global(.overflow-auto::-webkit-scrollbar) {
        width: 8px;
        height: 8px;
    }
    
    :global(.overflow-auto::-webkit-scrollbar-track) {
        background: transparent;
    }
    
    :global(.overflow-auto::-webkit-scrollbar-thumb) {
        background: #cbd5e1;
        border-radius: 4px;
    }
    
    :global(.dark .overflow-auto::-webkit-scrollbar-thumb) {
        background: #475569;
    }

    /* Ensure sticky header works in Firefox */
    :global(thead.sticky) {
        position: -webkit-sticky;
        position: sticky;
        z-index: 1;
    }
</style> 