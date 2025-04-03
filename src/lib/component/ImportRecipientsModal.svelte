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
    let columnCount = 0;
    let selectedRows = new Set<number>();
    let allRowsSelected = false;
    let isDragging = false;
    let importStep: 'initial' | 'nft-collection' | 'preview' = 'initial';
    let rawContent = '';
    let showPasteArea = false;
    let collectionId = '';
    let tempCollectionId = '';
    let isLoadingNFTHolders = false;
    let amountType: 'none' | 'per-holder' | 'per-nft' = 'none';
    let amountValue = '';
    let roundNumber = '';
    let tempRoundNumber = '';
    let collectionName = '';
    let collectionImageUrl = '';
    let isLoadingCollectionInfo = false;
    let totalTokens = 0;
    let uniqueOwners = 0;
    let currentRound = 0;

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

                // Skip invalid rows
                if (addressOrName.endsWith('.voi') && (!row.isValid || !row.resolvedAddress)) {
                    continue;
                }

                if (row.resolvedAddress) {
                    // Use already resolved .voi address
                    recipients.push({
                        address: row.resolvedAddress,
                        amount,
                        info: null,
                        isLoading: false,
                        isValid: true
                    });
                } else if (isValidAddressContent(addressOrName)) {
                    recipients.push({
                        address: addressOrName,
                        amount,
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
        selectedRows.clear();
        allRowsSelected = false;
        importStep = 'initial';
        rawContent = '';
        onClose();
    }

    async function fetchCollectionInfo(id: string, round?: string) {
        isLoadingCollectionInfo = true;
        collectionName = '';
        collectionImageUrl = '';
        totalTokens = 0;
        uniqueOwners = 0;
        currentRound = 0;
        
        try {
            const url = new URL('https://arc72-voi-mainnet.nftnavigator.xyz/nft-indexer/v1/tokens');
            url.searchParams.set('contractId', id);
            url.searchParams.set('limit', '1000');
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

        } catch (err) {
            console.error('Failed to fetch collection info:', err);
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

            // Convert to our data format with optional amount
            parsedData = Array.from(holdersMap.entries()).map(([address, count]) => {
                const cells = [address];
                
                // Add NFT count column
                cells.push(count.toString());
                
                // Add amount column if specified
                if (amountType !== 'none') {
                    const amount = amountType === 'per-holder' 
                        ? amountValue 
                        : (Number(amountValue) * count).toString();
                    cells.push(amount);
                }
                
                return {
                    cells,
                    isValid: isValidAddressContent(address)
                };
            });

            columnCount = amountType === 'none' ? 2 : 3; // Address, NFT count, and optionally amount
            addressColumnIndex = 0;
            amountColumnIndex = amountType === 'none' ? -1 : 2; // Set amount column if present
            importStep = 'preview';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to fetch NFT holders';
            parsedData = [];
        } finally {
            isLoadingNFTHolders = false;
        }
    }
</script>

<Modal bind:open size="xl" on:close={handleClose} class="w-full" data-modal-import>
    <div class="w-full h-[calc(90vh-2rem)]">
        <div class="h-full flex flex-col">
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

            <div class="flex-1 min-h-0 h-full content-center">
                {#if importStep === 'initial'}
                    <div 
                        class="place-self-center border-2 border-dashed rounded-lg p-8 sm:p-28 text-center flex items-center justify-center {isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700'}"
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
                                </div>

                                <p class="text-xs text-gray-500 dark:text-gray-400">
                                    Supported formats: CSV, TSV, TXT, XLSX, Markdown tables, or JSON arrays
                                </p>
                            </div>
                        {/if}
                    </div>
                {:else if importStep === 'nft-collection'}
                    <div class="flex items-center justify-center place-self-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg px-8 py-8 sm:px-28 sm:py-16 text-center">
                        <div class="w-full max-w-lg mx-auto space-y-6">
                            <div class="text-gray-500 dark:text-gray-400">
                                <i class="fas fa-users text-4xl mb-4"></i>
                                <p class="text-lg mb-2">Import NFT Collection Holders</p>
                                <p class="text-sm">Enter a collection ID or paste an <a href="https://nftnavigator.xyz/" target="_blank" class="text-blue-500">NFT Navigator</a> collection URL</p>
                            </div>
                            
                            <div class="space-y-4">
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

                                {#if collectionName || collectionImageUrl}
                                    <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
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
                                    <Label>Amount Distribution (Optional)</Label>
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
                                    </div>
                                    {#if amountType !== 'none'}
                                        <div class="mt-2">
                                            <Input
                                                type="number"
                                                placeholder={amountType === 'per-holder' ? 'Amount per holder' : 'Amount per NFT'}
                                                bind:value={amountValue}
                                            />
                                            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                {#if amountType === 'per-holder'}
                                                    Each holder will receive this amount
                                                {:else}
                                                    Amount will be multiplied by the number of NFTs held
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
                                            error = null;
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button 
                                        color="blue"
                                        disabled={isLoadingNFTHolders}
                                        on:click={handleNFTCollectionImport}
                                    >
                                        {#if isLoadingNFTHolders}
                                            <i class="fas fa-spinner fa-spin mr-2"></i>
                                            Loading...
                                        {:else}
                                            Import Holders
                                        {/if}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="h-full flex flex-col border dark:border-gray-700 rounded-lg overflow-hidden">
                        <div class="flex-1 overflow-auto">
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

            <div class="flex-none mt-6">
                <div class="flex justify-end gap-3">
                    <Button color="alternative" on:click={handleClose}>Cancel</Button>
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