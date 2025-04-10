<script lang="ts">
  import { Modal } from 'flowbite-svelte';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { selectedWallet, signTransactions, connectedWallets } from 'avm-wallet-svelte';
  import QRCode from 'qrcode';
  import algosdk from 'algosdk';
  import { onMount } from 'svelte';
  import { getNFD, searchNFDomains } from '$lib/utils/nfd';
  import { searchEnvoi, getEnvoiNames } from '$lib/utils/envoi';
  import { algodClient } from '$lib/utils/algod';
  import BridgeAnimation from './BridgeAnimation.svelte';
  import confetti from 'canvas-confetti';

  interface BridgeToken {
    name: string;
    voiAssetId: string;
    algorandAssetId: string;
    symbol: string;
    bridgedSymbol: string;
  }

  const BRIDGE_TOKENS: Record<string, BridgeToken> = {
    'VOI': {
      name: 'VOI',
      voiAssetId: '0', // Network token
      algorandAssetId: '2320775407',
      symbol: 'VOI',      // Token symbol on VOI Network
      bridgedSymbol: 'aVOI'  // Token symbol on Algorand
    },
    'USDC': {
      name: 'USDC',
      voiAssetId: '302190',
      algorandAssetId: '31566704',
      symbol: 'aUSDC',    // Token symbol on VOI Network
      bridgedSymbol: 'USDC'  // Token symbol on Algorand
    }
  };

  type BridgeStatus = 'idle' | 'signing' | 'submitting' | 'bridging' | 'completed' | 'error';
  type BridgeDetails = {
    sourceTxId: string;
    destinationTxId?: string;
    error?: string;
  };

  export let show = false;
  export let tokenKey: keyof typeof BRIDGE_TOKENS = 'VOI';
  export let canSignTransactions = false;
  
  $: selectedToken = BRIDGE_TOKENS[tokenKey];
  
  const dispatch = createEventDispatcher();
  let selectedDirection: 'voi-to-algorand' | 'algorand-to-voi' = 'voi-to-algorand';
  let algorandDestinationAddress = '';
  let voiDestinationAddress = '';
  let amount = '';
  let qrCodeDataUrl = '';
  let peraWalletUrl = '';
  let showQrCode = false;
  let isOptedIn = false;
  let isCheckingOptIn = false;
  let optInQrCodeDataUrl = '';
  let showOptInQrCode = false;
  let voiBalance: number | null = null;
  let isLoadingBalance = false;
  let bridgeStatus: BridgeStatus = 'idle';
  let bridgeDetails: BridgeDetails | null = null;
  let bridgeMonitorInterval: number | undefined;
  let bridgeError: string | null = null;
  let isMonitoringAlgorand = false;
  let monitoringDots = '';
  let dotsInterval: number | undefined;
  let startMonitoringRound: number | null = null;
  let remainingChecks = 3; // Add counter for remaining checks after modal closure

  interface NFDResult {
    name: string;
    owner: string;
    properties?: {
      verified?: {
        avatar?: string;
        avatarAsaId?: number;
      };
      userDefined?: {
        avatar?: string;
      };
    };
  }

  interface ResolvedName {
    name: string;
    address: string;
    avatar: string | undefined;
  }

  let searchResults: (NFDResult | ResolvedName)[] = [];
  let isSearching = false;
  let showSearchResults = false;
  let searchTimeout: number | undefined;
  let isValidDestination = false;
  let resolvedName: ResolvedName | null = null;
  let selectedSearchIndex = -1;
  let searchInputRef: HTMLInputElement;
  let searchDropdownRef: HTMLDivElement;
  let showConnectedWallets = false;
  let uniqueConnectedWallets: string[] = [];

  let algorandSourceAddress = '';
  let algorandSourceBalance: number | null = null;
  let isLoadingAlgorandBalance = false;
  let algorandSourceResolvedName: ResolvedName | null = null;
  let isValidSourceAddress = false;
  let showSourceSearchResults = false;
  let sourceSearchResults: (NFDResult | ResolvedName)[] = [];
  let selectedSourceSearchIndex = -1;
  
  $: destinationAddress = isVoiToAlgorand ? algorandDestinationAddress : voiDestinationAddress;
  $: isVoiToAlgorand = selectedDirection === 'voi-to-algorand';
  $: destinationNetwork = isVoiToAlgorand ? 416001 : 416101;
  $: amountInAtomicUnits = Math.floor(Number(amount) * 1e6);
  $: feeAmount = Math.floor(amountInAtomicUnits * 0.001); // 0.1% fee
  $: destinationAmount = amountInAtomicUnits - feeAmount;
  $: displayFeeAmount = feeAmount / 1e6;
  $: displayDestinationAmount = destinationAmount / 1e6;
  
  const BRIDGE_ADDRESS = 'ARAMIDFJYV2TOFB5MRNZJIXBSAVZCVAUDAPFGKR5PNX4MTILGAZABBTXQQ';

  const unsub = selectedWallet.subscribe((wallet) => {
    if (wallet?.address) {
      fetchVoiBalance(wallet.address);
    } else {
      voiBalance = null;
    }
  });

  // Subscribe to connectedWallets store and maintain unique addresses
  const unsubConnectedWallets = connectedWallets.subscribe((wallets) => {
    // Create a Set to automatically handle uniqueness
    const uniqueAddresses = new Set(wallets.map(w => w.address));
    uniqueConnectedWallets = Array.from(uniqueAddresses);
  });

  onDestroy(() => {
    unsub();
    unsubConnectedWallets();
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
  });
  
  // Handle input changes
  async function handleInput(input: string) {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Update the appropriate address based on direction
    if (isVoiToAlgorand) {
      algorandDestinationAddress = input;
    } else {
      voiDestinationAddress = input;
    }
    
    // Check if input is a valid address
    if (algosdk.isValidAddress(input)) {
      isValidDestination = true;
      showSearchResults = false;
      
      // Try to resolve name based on direction
      if (isVoiToAlgorand) {
        // Try to resolve NFD for this address
        const nfdResults = await getNFD([input]);
        if (nfdResults.length > 0) {
          const searchResult = await searchNFDomains(nfdResults[0].replacementValue);
          resolvedName = searchResult[0] ? {
            name: searchResult[0].name,
            address: searchResult[0].owner,
            avatar: getAvatarUrl(searchResult[0]) || undefined
          } : null;
        } else {
          resolvedName = null;
        }
      } else {
        // Try to resolve Envoi name for this address
        const envoiResults = await getEnvoiNames([input]);
        if (envoiResults.length > 0) {
          resolvedName = {
            name: envoiResults[0].name,
            address: envoiResults[0].address,
            avatar: envoiResults[0].metadata.avatar || undefined
          };
        } else {
          resolvedName = null;
        }
      }
      return;
    }
    
    // Not an address, so handle as name search
    isValidDestination = false;
    resolvedName = null;
    
    if (input.length < 2) {
      searchResults = [];
      showSearchResults = false;
      return;
    }
    
    searchTimeout = window.setTimeout(async () => {
      isSearching = true;
      try {
        if (isVoiToAlgorand) {
          const results = await searchNFDomains(input);
          searchResults = results;
        } else {
          const results = await searchEnvoi(input);
          searchResults = results.map(result => ({
            name: result.name,
            address: result.address,
            avatar: result.metadata.avatar || undefined
          }));
        }
        showSearchResults = true;
      } catch (error) {
        console.error('Error searching names:', error);
        searchResults = [];
      } finally {
        isSearching = false;
      }
    }, 300);
  }

  function selectSearchResult(result: typeof searchResults[0]) {
    if ('owner' in result) {
      // NFD result
      algorandDestinationAddress = result.owner;
      resolvedName = {
        name: result.name,
        address: result.owner,
        avatar: getAvatarUrl(result) || undefined
      };
    } else {
      // Envoi result
      voiDestinationAddress = result.address;
      resolvedName = result;
    }
    isValidDestination = true;
    showSearchResults = false;
  }

  function getAvatarUrl(result: NFDResult): string | null {
    if (!result.properties) return null;
    // First try verified avatar, then userDefined avatar
    if (result.properties.verified?.avatar) {
      return result.properties.verified.avatar;
    }
    return result.properties.userDefined?.avatar || null;
  }

  async function handleSubmit() {
    if (isVoiToAlgorand) {
      const note = {
        destinationNetwork,
        destinationAddress,
        destinationToken: selectedToken.algorandAssetId,
        feeAmount,
        destinationAmount,
        note: "voirewards",
        sourceAmount: destinationAmount
      };
      
      const noteString = `aramid-transfer/v1:j${JSON.stringify(note)}`;
      
      try {
        bridgeStatus = 'signing';
        bridgeError = null;

        if (!$selectedWallet?.address) {
          throw new Error('No wallet connected');
        }

        // Get suggested params for the transaction
        const params = await algodClient.getTransactionParams().do();
        
        // Create the transaction based on token type
        let txn;
        if (selectedToken.voiAssetId === '0') {
          // Payment transaction for VOI
          txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: BRIDGE_ADDRESS,
            amount: amountInAtomicUnits,
            note: new TextEncoder().encode(noteString),
            suggestedParams: params
          });
        } else {
          // ASA transfer for other tokens
          txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: $selectedWallet.address,
            to: BRIDGE_ADDRESS,
            amount: amountInAtomicUnits,
            assetIndex: parseInt(selectedToken.voiAssetId),
            note: new TextEncoder().encode(noteString),
            suggestedParams: params
          });
        }

        // Sign transaction
        let signedTxns;
        try {
          signedTxns = await signTransactions([[txn]]);
        } catch (error) {
          // User rejected or signing failed
          bridgeStatus = 'error';
          bridgeError = error instanceof Error ? error.message : 'Transaction signing failed or was rejected';
          return;
        }

        // Submit transaction
        bridgeStatus = 'submitting';
        let txId;
        try {
          const response = await algodClient.sendRawTransaction(signedTxns).do();
          txId = response.txId;
        } catch (error) {
          bridgeStatus = 'error';
          bridgeError = error instanceof Error ? error.message : 'Failed to submit transaction to network';
          return;
        }
        
        // Wait for confirmation
        try {
          await algosdk.waitForConfirmation(algodClient, txId, 4);
        } catch (error) {
          bridgeStatus = 'error';
          bridgeError = error instanceof Error ? error.message : 'Transaction failed to confirm';
          return;
        }
        
        // Update bridge status and start monitoring
        bridgeStatus = 'bridging';
        bridgeDetails = { sourceTxId: txId };
        
        // Start monitoring for the destination transaction
        startBridgeMonitoring(txId);
        
      } catch (error) {
        console.error('Error creating bridge transaction:', error);
        bridgeStatus = 'error';
        bridgeError = error instanceof Error ? error.message : 'An unexpected error occurred';
        bridgeDetails = null;
      }
    } else {
      // Generate QR code for Algorand to VOI transfer
      const note = {
        destinationNetwork,
        destinationAddress: voiDestinationAddress,
        destinationToken: selectedToken.voiAssetId,
        feeAmount,
        destinationAmount,
        note: "voirewards",
        sourceAmount: destinationAmount
      };
      
      const noteString = `aramid-transfer/v1:j${JSON.stringify(note)}`;
      
      // Construct Pera Wallet URL
      const peraUrl = `perawallet://${BRIDGE_ADDRESS}?amount=${amountInAtomicUnits}&asset=${selectedToken.algorandAssetId}&xnote=${noteString}`;
      peraWalletUrl = peraUrl;
      
      try {
        qrCodeDataUrl = await QRCode.toDataURL(peraUrl);
        showQrCode = true;
      } catch (err) {
        console.error('Error generating QR code:', err);
        bridgeStatus = 'error';
        bridgeError = 'Failed to generate QR code';
      }
    }
  }

  async function startBridgeMonitoring(sourceTxId: string) {
    // Clear any existing intervals
    if (bridgeMonitorInterval) {
      clearInterval(bridgeMonitorInterval);
      bridgeMonitorInterval = undefined;
    }
    if (dotsInterval) {
      clearInterval(dotsInterval);
      dotsInterval = undefined;
    }

    const checkDestinationTx = async () => {
      try {
        // Base64 encode the note prefix
        const notePrefix = 'aramid-confirm/v1:j';
        const base64NotePrefix = Buffer.from(notePrefix).toString('base64');
        
        // Search for transactions with the aramid-confirm prefix
        // Use Voi indexer for Algorand->Voi bridges, and Algorand indexer for Voi->Algorand bridges
        const indexerUrl = isVoiToAlgorand 
          ? 'https://mainnet-idx.4160.nodely.dev'
          : 'https://mainnet-idx.voi.nodely.dev';
        
        // Use the correct destination address based on direction
        const monitorAddress = isVoiToAlgorand 
          ? algorandDestinationAddress 
          : voiDestinationAddress;
        
        const response = await fetch(
          `${indexerUrl}/v2/transactions?note-prefix=${encodeURIComponent(base64NotePrefix)}&address=${monitorAddress}&limit=1`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch transactions');
        }

        const data = await response.json();
        const transactions = data.transactions || [];

        for (const tx of transactions) {
          try {
            const noteString = new TextDecoder().decode(Buffer.from(tx.note, 'base64'));
            if (!noteString.startsWith(notePrefix)) continue;
            
            const noteData = JSON.parse(noteString.replace(notePrefix, ''));
            
            // Check for the correct source network based on direction
            const expectedSourceNetwork = isVoiToAlgorand ? 416101 : 416001;
            if (noteData.sourceTxId === sourceTxId && noteData.sourceNetwork === expectedSourceNetwork) {
              // Found the confirmation transaction
              bridgeStatus = 'completed';
              bridgeDetails = {
                ...bridgeDetails!,
                destinationTxId: tx.id
              };
              
              // Clear both intervals
              if (bridgeMonitorInterval) {
                clearInterval(bridgeMonitorInterval);
                bridgeMonitorInterval = undefined;
              }
              if (dotsInterval) {
                clearInterval(dotsInterval);
                dotsInterval = undefined;
              }
              
              // Trigger celebratory confetti
              triggerCelebration();
              
              return;
            }
          } catch (e) {
            console.error('Error parsing note:', e);
          }
        }
      } catch (error) {
        console.error('Error checking destination transaction:', error);
        // If there's an error, we might want to stop monitoring
        if (error instanceof Error && error.message.includes('Failed to fetch')) {
          if (bridgeMonitorInterval) {
            clearInterval(bridgeMonitorInterval);
            bridgeMonitorInterval = undefined;
          }
          if (dotsInterval) {
            clearInterval(dotsInterval);
            dotsInterval = undefined;
          }
        }
      }
    };

    // Check immediately and then every 5 seconds
    await checkDestinationTx();
    if (!bridgeMonitorInterval) { // Only set if not already set
      bridgeMonitorInterval = window.setInterval(checkDestinationTx, 5000);
    }
  }

  function triggerCelebration() {
    const duration = 8 * 1000;
    const animationEnd = Date.now() + duration;

    // Create a confetti cannon on each side
    const leftCannon = confetti.create(undefined, { 
      resize: true,
      useWorker: true 
    });
    const rightCannon = confetti.create(undefined, { 
      resize: true,
      useWorker: true 
    });

    const colors = ['#22c55e', '#3b82f6']; // emerald-500 and blue-500

    const shootConfetti = () => {
      const timeLeft = animationEnd - Date.now();
      
      if (timeLeft <= 0) {
        leftCannon.reset();
        rightCannon.reset();
        return;
      }

      // Left cannon
      leftCannon({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: colors,
      });

      // Right cannon
      rightCannon({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: colors,
      });

      requestAnimationFrame(shootConfetti);
    };

    shootConfetti();
  }

  // Clean up interval on component destroy
  onDestroy(() => {
    if (bridgeMonitorInterval) {
      clearInterval(bridgeMonitorInterval);
    }
    if (dotsInterval) {
      clearInterval(dotsInterval);
    }
  });

  function resetBridgeState() {
    bridgeStatus = 'idle';
    bridgeDetails = null;
    bridgeError = null;
    startMonitoringRound = null;
    if (bridgeMonitorInterval) {
      clearInterval(bridgeMonitorInterval);
    }
    if (dotsInterval) {
      clearInterval(dotsInterval);
    }
  }

  function goBack() {
    bridgeStatus = 'idle';
    bridgeError = null;
    bridgeDetails = null;
    if (bridgeMonitorInterval) {
      clearInterval(bridgeMonitorInterval);
    }
  }

  function closeModal() {
    show = false;
    algorandDestinationAddress = '';
    voiDestinationAddress = '';
    searchResults = [];
    showSearchResults = false;
    isMonitoringAlgorand = false;
    monitoringDots = '';
    resetBridgeState();
    dispatch('close');
  }

  async function checkOptIn(address: string) {
    if (!address || !algosdk.isValidAddress(address)) return;
    
    isCheckingOptIn = true;
    try {
      // For VOI->Algorand, check Algorand address for aVOI opt-in
      // For Algorand->VOI, check VOI address for aUSDC opt-in (if not VOI token)
      const assetId = isVoiToAlgorand ? selectedToken.algorandAssetId : selectedToken.voiAssetId;
      const endpoint = isVoiToAlgorand ? 
        'https://mainnet-api.4160.nodely.dev' : 
        'https://mainnet-api.voi.nodely.dev';

      // Skip opt-in check if this is the VOI network token
      if (!isVoiToAlgorand && selectedToken.voiAssetId === '0') {
        isOptedIn = true;
        return;
      }

      const response = await fetch(`${endpoint}/v2/accounts/${address}/assets/${assetId}`);
      isOptedIn = response.status === 200;
    } catch (error) {
      console.error('Error checking opt-in status:', error);
      isOptedIn = false;
    } finally {
      isCheckingOptIn = false;
    }
  }

  async function generateOptInQrCode() {
    const assetId = isVoiToAlgorand ? selectedToken.algorandAssetId : selectedToken.voiAssetId;
    const optInUrl = `perawallet://?amount=0&asset=${assetId}`;
    try {
      optInQrCodeDataUrl = await QRCode.toDataURL(optInUrl);
      showOptInQrCode = true;
    } catch (err) {
      console.error('Error generating opt-in QR code:', err);
    }
  }

  // Watch for changes in destination address to check opt-in status
  $: if (isVoiToAlgorand && isValidDestination && destinationAddress) {
    checkOptIn(destinationAddress);
  }

  async function fetchVoiBalance(address: string) {
    if (!address) return;
    
    isLoadingBalance = true;
    try {
      const accountInfo = await algodClient.accountInformation(address).do();
      if (selectedToken.voiAssetId === '0') {
        // For VOI token
        voiBalance = accountInfo.amount / 1e6;
      } else {
        // For ASAs
        const asset = accountInfo['assets']?.find(
          (a: any) => a['asset-id'].toString() === selectedToken.voiAssetId
        );
        voiBalance = asset ? asset.amount / 1e6 : 0;
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
      voiBalance = null;
    } finally {
      isLoadingBalance = false;
    }
  }

  // Handle click outside search dropdown
  function handleClickOutside(event: MouseEvent) {
    if (searchDropdownRef && !searchDropdownRef.contains(event.target as Node) && 
        searchInputRef && !searchInputRef.contains(event.target as Node)) {
      showSearchResults = false;
      showConnectedWallets = false;
      selectedSearchIndex = -1;
    }
  }

  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (!showSearchResults && !showConnectedWallets) return;
    if (showConnectedWallets && uniqueConnectedWallets.length === 0) return;
    if (showSearchResults && searchResults.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (showConnectedWallets) {
          selectedSearchIndex = (selectedSearchIndex + 1) % uniqueConnectedWallets.length;
        } else {
          selectedSearchIndex = (selectedSearchIndex + 1) % searchResults.length;
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (showConnectedWallets) {
          selectedSearchIndex = selectedSearchIndex <= 0 ? uniqueConnectedWallets.length - 1 : selectedSearchIndex - 1;
        } else {
          selectedSearchIndex = selectedSearchIndex <= 0 ? searchResults.length - 1 : selectedSearchIndex - 1;
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedSearchIndex >= 0) {
          if (showConnectedWallets) {
            const address = uniqueConnectedWallets[selectedSearchIndex];
            voiDestinationAddress = address;
            isValidDestination = true;
            showConnectedWallets = false;
            // Try to resolve Envoi name
            getEnvoiNames([address]).then(results => {
              if (results.length > 0) {
                resolvedName = {
                  name: results[0].name,
                  address: results[0].address,
                  avatar: results[0].metadata.avatar || undefined
                };
              }
            });
          } else {
            selectSearchResult(searchResults[selectedSearchIndex]);
          }
        }
        break;
      case 'Escape':
        showSearchResults = false;
        showConnectedWallets = false;
        selectedSearchIndex = -1;
        break;
    }
  }

  // Reset search state when direction changes
  $: if (selectedDirection) {
    showSearchResults = false;
    selectedSearchIndex = -1;
    resolvedName = null;
    isValidDestination = false;
    
    // Clear the destination address that's no longer relevant
    if (isVoiToAlgorand) {
      voiDestinationAddress = '';
    } else {
      algorandDestinationAddress = '';
    }
  }

  function getInitials(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase();
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  async function handleSourceInput(input: string) {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    algorandSourceAddress = input;
    
    // Check if input is a valid address
    if (algosdk.isValidAddress(input)) {
      isValidSourceAddress = true;
      showSourceSearchResults = false;
      
      // Try to resolve NFD for this address
      const nfdResults = await getNFD([input]);
      if (nfdResults.length > 0) {
        const searchResult = await searchNFDomains(nfdResults[0].replacementValue);
        algorandSourceResolvedName = searchResult[0] ? {
          name: searchResult[0].name,
          address: searchResult[0].owner,
          avatar: getAvatarUrl(searchResult[0]) || undefined
        } : null;
      } else {
        algorandSourceResolvedName = null;
      }

      // Check balance
      await checkAlgorandBalance(input);
      return;
    }
    
    // Not an address, so handle as name search
    isValidSourceAddress = false;
    algorandSourceResolvedName = null;
    algorandSourceBalance = null;
    
    if (input.length < 2) {
      sourceSearchResults = [];
      showSourceSearchResults = false;
      return;
    }
    
    searchTimeout = window.setTimeout(async () => {
      isSearching = true;
      try {
        const results = await searchNFDomains(input);
        sourceSearchResults = results;
        showSourceSearchResults = true;
      } catch (error) {
        console.error('Error searching names:', error);
        sourceSearchResults = [];
      } finally {
        isSearching = false;
      }
    }, 300);
  }

  function selectSourceSearchResult(result: typeof sourceSearchResults[0]) {
    if ('owner' in result) {
      // NFD result
      algorandSourceAddress = result.owner;
      algorandSourceResolvedName = {
        name: result.name,
        address: result.owner,
        avatar: getAvatarUrl(result) || undefined
      };
    }
    isValidSourceAddress = true;
    showSourceSearchResults = false;
    checkAlgorandBalance(algorandSourceAddress);
  }

  async function checkAlgorandBalance(address: string) {
    if (!address || !algosdk.isValidAddress(address)) return;
    
    isLoadingAlgorandBalance = true;
    try {
      const response = await fetch(`https://mainnet-api.4160.nodely.dev/v2/accounts/${address}/assets/${selectedToken.algorandAssetId}`);
      if (response.status === 200) {
        const data = await response.json();
        algorandSourceBalance = data['asset-holding'].amount / 1e6;
      } else {
        algorandSourceBalance = 0;
      }
    } catch (error) {
      console.error('Error checking Algorand balance:', error);
      algorandSourceBalance = null;
    } finally {
      isLoadingAlgorandBalance = false;
    }
  }

  function handleSourceKeydown(event: KeyboardEvent) {
    if (!showSourceSearchResults || sourceSearchResults.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedSourceSearchIndex = (selectedSourceSearchIndex + 1) % sourceSearchResults.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedSourceSearchIndex = selectedSourceSearchIndex <= 0 ? sourceSearchResults.length - 1 : selectedSourceSearchIndex - 1;
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedSourceSearchIndex >= 0) {
          selectSourceSearchResult(sourceSearchResults[selectedSourceSearchIndex]);
        }
        break;
      case 'Escape':
        showSourceSearchResults = false;
        selectedSourceSearchIndex = -1;
        break;
    }
  }

  $: isValidAmount = amount && Number(amount) > 0 && Number(amount) <= (isVoiToAlgorand ? (voiBalance || 0) : (algorandSourceBalance || Number.MAX_VALUE));

  $: isFormValid = isValidDestination && isValidAmount &&
    (!isVoiToAlgorand || isOptedIn) &&
    (!isVoiToAlgorand || !isValidSourceAddress || (algorandSourceBalance !== null && algorandSourceBalance >= Number(amount)));

  $: submitButtonDisabled = bridgeStatus !== 'idle' || !isFormValid;

  $: submitButtonTooltip = !isValidDestination 
    ? 'Please enter a valid destination address'
    : !isValidAmount
    ? 'Please enter a valid amount'
    : isVoiToAlgorand && isValidSourceAddress && algorandSourceBalance !== null && algorandSourceBalance < Number(amount)
    ? 'Insufficient balance in source address'
    : '';

  // Function to monitor Algorand transactions
  async function monitorAlgorandTransactions() {
    if (!isVoiToAlgorand) {
      try {
        // If modal is closed, decrement remaining checks
        if (!showQrCode) {
          remainingChecks--;
          console.log(`Remaining checks: ${remainingChecks}`);
        }

        // Get the initial round only once when monitoring starts
        if (startMonitoringRound === null) {
          const status = await fetch('https://mainnet-idx.4160.nodely.dev/health');
          if (!status.ok) {
            throw new Error('Failed to fetch Algorand status');
          }
          const statusData = await status.json();
          startMonitoringRound = Number(statusData.round);
          console.log('Starting monitoring from round:', startMonitoringRound);
          return; // Wait for next interval to start checking transactions
        }

        // Base64 encode the note prefix for aramid-transfer
        const notePrefix = 'aramid-transfer/v1:j';
        const base64NotePrefix = Buffer.from(notePrefix).toString('base64');

        // Search for transactions with the aramid-transfer prefix after our start round
        const response = await fetch(
          `https://mainnet-idx.4160.nodely.dev/v2/transactions?note-prefix=${encodeURIComponent(base64NotePrefix)}&min-round=${startMonitoringRound}&limit=10`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch Algorand transactions');
        }

        const data = await response.json();
        const transactions = data.transactions || [];

        for (const tx of transactions) {
          try {
            // Decode and parse the note
            const noteString = new TextDecoder().decode(Buffer.from(tx.note, 'base64'));
            if (!noteString.startsWith(notePrefix)) continue;
            
            const noteData = JSON.parse(noteString.replace(notePrefix, ''));

            // Check if this transaction matches our expected parameters
            if (tx['asset-transfer-transaction']?.['asset-id'] === Number(selectedToken.algorandAssetId) &&
                tx['asset-transfer-transaction'].receiver === BRIDGE_ADDRESS &&
                tx['asset-transfer-transaction'].amount === amountInAtomicUnits &&
                noteData.destinationAddress === voiDestinationAddress) {
              
              // If we have a source address, verify it matches
              if (algorandSourceAddress && tx.sender !== algorandSourceAddress) {
                continue;
              }

              // Found the bridge transaction
              bridgeStatus = 'bridging';
              bridgeDetails = {
                sourceTxId: tx.id
              };
              
              // Clear the monitoring intervals
              if (bridgeMonitorInterval) {
                clearInterval(bridgeMonitorInterval);
              }
              if (dotsInterval) {
                clearInterval(dotsInterval);
              }
              
              // Start monitoring for the Voi confirmation
              startBridgeMonitoring(tx.id);
              return;
            }
          } catch (error) {
            console.error('Error parsing transaction note:', error);
          }
        }
      } catch (error) {
        console.error('Error monitoring Algorand transactions:', error);
      }
    }
  }

  // Update dots animation
  function updateDots() {
    monitoringDots = monitoringDots.length >= 3 ? '' : monitoringDots + '.';
  }

  // Start monitoring when QR code is shown
  $: if (showQrCode && !isVoiToAlgorand) {
    isMonitoringAlgorand = true;
    startMonitoringRound = null; // Reset the starting round
    remainingChecks = 3; // Reset remaining checks
    // Start dots animation
    if (dotsInterval) {
      clearInterval(dotsInterval);
    }
    dotsInterval = window.setInterval(updateDots, 500);
    // Start monitoring Algorand transactions
    if (bridgeMonitorInterval) {
      clearInterval(bridgeMonitorInterval);
    }
    bridgeMonitorInterval = window.setInterval(monitorAlgorandTransactions, 5000);
    monitorAlgorandTransactions(); // Check immediately
  }

  // Handle QR modal closure
  $: if (!showQrCode && isMonitoringAlgorand) {
    // If we're still monitoring but modal is closed, start countdown
    if (remainingChecks > 0) {
      console.log(`QR modal closed. Will check ${remainingChecks} more times.`);
    } else {
      // No more checks remaining, clean up
      if (bridgeMonitorInterval) {
        clearInterval(bridgeMonitorInterval);
        bridgeMonitorInterval = undefined;
      }
      if (dotsInterval) {
        clearInterval(dotsInterval);
        dotsInterval = undefined;
      }
      isMonitoringAlgorand = false;
      console.log('Monitoring stopped after final checks.');
    }
  }

  onDestroy(() => {
    if (bridgeMonitorInterval) {
      clearInterval(bridgeMonitorInterval);
    }
    if (dotsInterval) {
      clearInterval(dotsInterval);
    }
  });

  function handleOptInQrCodeClose() {
    showOptInQrCode = false;
    if (isValidDestination && destinationAddress) {
      checkOptIn(destinationAddress);
    }
  }

  // Add token selector state
  let showTokenSelector = false;
  let tokenSelectorRef: HTMLDivElement;

  // Handle click outside token selector
  function handleTokenSelectorClickOutside(event: MouseEvent) {
    if (tokenSelectorRef && !tokenSelectorRef.contains(event.target as Node)) {
      showTokenSelector = false;
    }
  }

  onMount(() => {
    document.addEventListener('click', handleTokenSelectorClickOutside);
    return () => {
      document.removeEventListener('click', handleTokenSelectorClickOutside);
    };
  });

  // Update the selectedDirection reactive declaration to default to algorand-to-voi when canSignTransactions is false
  $: {
    if (!canSignTransactions && selectedDirection === 'voi-to-algorand') {
      selectedDirection = 'algorand-to-voi';
    }
  }
</script>

<style>
  /* Add touch-friendly tap targets */
  @media (max-width: 640px) {
    :global(.mobile-tap-target) {
      min-height: 44px;
    }
    
    :global(.mobile-select) {
      font-size: 16px; /* Prevents iOS zoom on focus */
    }
  }
</style>

<Modal 
  bind:open={show} 
  size="md" 
  autoclose={false} 
  class="w-full max-h-[95vh] md:max-h-[90vh] overflow-visible" 
  bodyClass="p-2 md:p-4 flex-1 overflow-y-auto overscroll-contain"
  backdropClass="!fixed inset-0 bg-gray-900/50 dark:bg-gray-900/80"
>
  <div class="flex flex-col h-full">
    <!-- Fixed Header -->
    <div class="px-3 py-3 md:px-6 md:py-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex flex-col md:flex-row md:items-end md:justify-between space-y-2 md:space-y-0">
        <div class="flex items-center space-x-2">
          <h3 class="text-lg md:text-xl font-medium text-gray-900 dark:text-white">Bridge</h3>
          <div class="relative" bind:this={tokenSelectorRef}>
            <button
              type="button"
              class="inline-flex items-center px-4 py-1.5 text-xl font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-50 dark:disabled:hover:bg-blue-900/30 disabled:hover:border-blue-200 dark:disabled:hover:border-blue-800"
              on:click={() => bridgeStatus === 'idle' && (showTokenSelector = !showTokenSelector)}
              disabled={bridgeStatus !== 'idle'}
            >
              <div class="flex items-center space-x-2">
                <span>{selectedToken.name}</span>
                <svg class="w-5 h-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4 4 4-4" />
                </svg>
              </div>
            </button>

            {#if showTokenSelector}
              <div class="absolute z-50 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 transform transition-all duration-200 origin-top">
                <ul class="py-1">
                  {#each Object.entries(BRIDGE_TOKENS) as [key, token]}
                    <li>
                      <button
                        class="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center space-x-2 transition-colors duration-150"
                        class:bg-blue-50={key === tokenKey}
                        class:dark:bg-blue-900={key === tokenKey}
                        class:text-blue-600={key === tokenKey}
                        class:dark:text-blue-400={key === tokenKey}
                        on:click={() => {
                          tokenKey = key;
                          showTokenSelector = false;
                          // Reset form state when token changes
                          amount = '';
                          algorandDestinationAddress = '';
                          voiDestinationAddress = '';
                          resolvedName = null;
                          isValidDestination = false;
                          showSearchResults = false;
                          searchResults = [];
                          algorandSourceAddress = '';
                          algorandSourceResolvedName = null;
                          isValidSourceAddress = false;
                          showSourceSearchResults = false;
                          sourceSearchResults = [];
                          algorandSourceBalance = null;
                          if ($selectedWallet?.address) {
                            fetchVoiBalance($selectedWallet.address);
                          }
                        }}
                      >
                        <div class="flex-1 font-medium">
                          <span class="block text-base">{token.name}</span>
                          <span class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {token.symbol} ↔ {token.bridgedSymbol}
                          </span>
                        </div>
                        {#if key === tokenKey}
                          <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                        {/if}
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
          <h3 class="text-xl font-medium text-gray-900 dark:text-white">Tokens</h3>
        </div>
        <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400">
          Powered by <a href="https://aramid.finance" target="_blank" class="text-blue-500 hover:underline">Aramid Bridge</a>
        </p>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto px-6 py-4">
      {#if bridgeStatus === 'idle'}
        <div class="space-y-6">
          <!-- Bridge Direction Selection -->
          <div class="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4">
            <div class="relative w-full md:w-1/2 group">
              <button
                class={`w-full p-3 md:p-4 border-2 rounded-lg transition-all duration-200 ${
                  selectedDirection === 'voi-to-algorand'
                    ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                } ${!canSignTransactions ? 'opacity-50 cursor-not-allowed' : ''}`}
                on:click={() => {
                  if (canSignTransactions) {
                    selectedDirection = 'voi-to-algorand';
                  }
                }}
                aria-describedby="voi-to-algo-tooltip"
              >
                <div class="flex flex-col items-center space-y-2 md:space-y-3">
                  <div class="font-medium text-base md:text-lg">
                    <span class="text-emerald-600 dark:text-emerald-400 font-semibold">VOI Network</span>
                    <span class="mx-2">→</span>
                    <span class="text-blue-600 dark:text-blue-400 font-semibold">Algorand</span>
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400 flex items-center">
                    <span class="mr-1">Receive</span>
                    <span class="font-medium text-blue-600 dark:text-blue-400">{selectedToken.bridgedSymbol}</span>
                    <span class="ml-1">on Algorand</span>
                  </div>
                </div>
              </button>
              {#if !canSignTransactions}
                <div
                  id="voi-to-algo-tooltip"
                  class="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm dark:bg-gray-700 -bottom-12 left-1/2 transform -translate-x-1/2 w-max"
                  role="tooltip"
                >
                  Please connect a VOI Network wallet<br/>to enable this option
                  <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-b-gray-900 dark:border-b-gray-700"></div>
                </div>
              {/if}
            </div>
            
            <div class="relative w-full md:w-1/2 group">
              <button
              class={`w-full p-3 md:p-4 border-2 rounded-lg transition-all duration-200 ${
                  selectedDirection === 'algorand-to-voi'
                    ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                }`}
                on:click={() => selectedDirection = 'algorand-to-voi'}
              >
                <div class="flex flex-col items-center space-y-3">
                  <div class="font-medium text-lg">
                    <span class="text-blue-600 dark:text-blue-400 font-semibold">Algorand</span>
                    <span class="mx-2">→</span>
                    <span class="text-emerald-600 dark:text-emerald-400 font-semibold">VOI Network</span>
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400 flex items-center">
                    <span class="mr-1">Receive</span>
                    <span class="font-medium text-emerald-600 dark:text-emerald-400">{selectedToken.symbol}</span>
                    <span class="ml-1">on VOI Network</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- Source Address (only for Algorand to VOI) -->
          {#if !isVoiToAlgorand}
            <div class="space-y-2">
              <div class="flex items-center space-x-2">
                <label for="sourceAddress" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Source <span class="text-blue-600 dark:text-blue-400 font-semibold">Algorand</span> Address
                </label>
                <span class="text-xs text-gray-500 dark:text-gray-400">(Optional)</span>
              </div>
              <div class="relative">
                <div class="relative">
                  <input
                    type="text"
                    bind:value={algorandSourceAddress}
                    on:input={(e) => handleSourceInput(e.currentTarget.value)}
                    on:keydown={handleSourceKeydown}
                    class="w-full px-3 py-2 md:py-2.5 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    placeholder="Enter address or search NFDomains..."
                    class:border-green-500={isValidSourceAddress}
                    class:border-red-500={algorandSourceAddress && !isValidSourceAddress}
                  />
                  {#if algorandSourceAddress}
                    <button
                      type="button"
                      class="absolute inset-y-0 right-0 pr-3 flex items-center"
                      aria-label="Clear input"
                      on:click={() => {
                        algorandSourceAddress = '';
                        algorandSourceResolvedName = null;
                        isValidSourceAddress = false;
                        showSourceSearchResults = false;
                        algorandSourceBalance = null;
                      }}
                    >
                      <svg class="w-4 h-4 text-gray-500 hover:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  {/if}
                </div>

                {#if showSourceSearchResults && sourceSearchResults.length > 0}
                  <div 
                    class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 md:max-h-60"
                  >
                    <ul class="max-h-60 overflow-auto py-1">
                      {#each sourceSearchResults as result, i}
                        <li>
                          <button
                            class="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                            class:bg-gray-100={i === selectedSourceSearchIndex}
                            class:dark:bg-gray-700={i === selectedSourceSearchIndex}
                            on:click={() => selectSourceSearchResult(result)}
                          >
                            <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                              {#if 'owner' in result && (result.properties?.verified?.avatar || result.properties?.userDefined?.avatar)}
                                <img 
                                  src={getAvatarUrl(result)}
                                  alt="Avatar"
                                  class="w-full h-full object-cover"
                                  on:error={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    target.style.display = 'none';
                                    (target.nextElementSibling as HTMLDivElement).style.display = 'flex';
                                  }}
                                />
                              {:else}
                                <div 
                                  class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-lg font-medium"
                                >
                                  {getInitials(result.name)}
                                </div>
                              {/if}
                            </div>
                            <div class="min-w-0 flex-1">
                              <div class="font-medium text-gray-900 dark:text-white truncate">
                                {result.name}
                              </div>
                              <div class="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {typeof result === 'object' && 'owner' in result ? result.owner : result.address}
                              </div>
                            </div>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if algorandSourceResolvedName}
                  <div class="mt-2 flex items-center space-x-2">
                    <div class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {#if algorandSourceResolvedName.avatar}
                        <img 
                          src={algorandSourceResolvedName.avatar}
                          alt="Avatar"
                          class="w-full h-full object-cover"
                          on:error={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.style.display = 'none';
                            (target.nextElementSibling as HTMLDivElement).style.display = 'flex';
                          }}
                        />
                      {:else}
                        <div 
                          class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium"
                        >
                          {getInitials(algorandSourceResolvedName.name)}
                        </div>
                      {/if}
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {algorandSourceResolvedName.name}
                    </p>
                  </div>
                {/if}

                {#if isValidSourceAddress}
                  <div class="mt-2">
                    {#if isLoadingAlgorandBalance}
                      <p class="text-sm text-gray-500 dark:text-gray-400">Loading aVOI balance...</p>
                    {:else if algorandSourceBalance !== null}
                      <button
                        class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        on:click={() => amount = algorandSourceBalance?.toString() || ''}
                      >
                        Available balance: {algorandSourceBalance.toFixed(6)} {isVoiToAlgorand ? selectedToken.symbol : selectedToken.bridgedSymbol}
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Destination Address -->
          <div class="space-y-2">
            <label for="destinationAddress" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Destination <span class={`${isVoiToAlgorand ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"} font-semibold`}>
                {isVoiToAlgorand ? 'Algorand' : 'VOI Network'}
              </span> Address
            </label>
            {#if isVoiToAlgorand}
              <div class="relative">
                <div class="relative">
                  <input
                    type="text"
                    bind:value={voiDestinationAddress}
                    bind:this={searchInputRef}
                    on:input={(e) => handleInput(e.currentTarget.value)}
                    on:keydown={handleKeydown}
                    on:focus={() => {
                      if (!voiDestinationAddress) {
                        showConnectedWallets = true;
                        showSearchResults = false;
                      }
                    }}
                    class="w-full px-3 py-2 md:py-2.5 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    placeholder={`Enter address or search ${isVoiToAlgorand ? 'NFDomains' : 'Envoi names'}...`}
                    class:border-green-500={isValidDestination}
                    class:border-red-500={destinationAddress && !isValidDestination}
                  />
                  {#if voiDestinationAddress}
                    <button
                      type="button"
                      class="absolute inset-y-0 right-0 pr-3 flex items-center"
                      aria-label="Clear input"
                      on:click={() => {
                        voiDestinationAddress = '';
                        resolvedName = null;
                        isValidDestination = false;
                        showSearchResults = false;
                      }}
                    >
                      <svg class="w-4 h-4 text-gray-500 hover:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  {/if}
                </div>

                {#if showSearchResults && searchResults.length > 0}
                  <div 
                    bind:this={searchDropdownRef}
                    class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 md:max-h-60"
                  >
                    <ul class="max-h-60 overflow-auto py-1">
                      {#each searchResults as result, i}
                        <li>
                          <button
                            class="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                            class:bg-gray-100={i === selectedSearchIndex}
                            class:dark:bg-gray-700={i === selectedSearchIndex}
                            on:click={() => selectSearchResult(result)}
                          >
                            <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                              {#if ('owner' in result && (result.properties?.verified?.avatar || result.properties?.userDefined?.avatar)) || ('avatar' in result && result.avatar)}
                                <img 
                                  src={'owner' in result ? getAvatarUrl(result) : result.avatar}
                                  alt="Avatar"
                                  class="w-full h-full object-cover"
                                  on:error={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    target.style.display = 'none';
                                    (target.nextElementSibling as HTMLDivElement).style.display = 'flex';
                                  }}
                                />
                              {:else}
                                <div 
                                  class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-lg font-medium"
                                >
                                  {getInitials('owner' in result ? result.name : result.name)}
                                </div>
                              {/if}
                            </div>
                            <div class="min-w-0 flex-1">
                              <div class="font-medium text-gray-900 dark:text-white truncate">
                                {result.name}
                              </div>
                              <div class="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {'owner' in result ? result.owner : result.address}
                              </div>
                            </div>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if resolvedName}
                  <div class="mt-2 flex items-center space-x-2">
                    <div class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {#if resolvedName.avatar}
                        <img 
                          src={resolvedName.avatar}
                          alt="Avatar"
                          class="w-full h-full object-cover"
                          on:error={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.style.display = 'none';
                            (target.nextElementSibling as HTMLDivElement).style.display = 'flex';
                          }}
                        />
                      {:else}
                        <div 
                          class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium"
                        >
                          {getInitials(resolvedName.name)}
                        </div>
                      {/if}
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {resolvedName.name}
                    </p>
                  </div>
                {/if}
                {#if isVoiToAlgorand && isValidDestination}
                    <div class="mb-4">
                    {#if isCheckingOptIn}
                        <p class="text-sm text-gray-500 dark:text-gray-400">Checking if address is opted into {selectedToken.bridgedSymbol}...</p>
                    {:else if !isOptedIn}
                        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                        <p class="text-sm text-yellow-700 dark:text-yellow-200 mb-2">
                            This address has not opted into {selectedToken.bridgedSymbol}. The recipient must opt in to asset {selectedToken.algorandAssetId} before receiving tokens.
                        </p>
                        <div class="flex space-x-2">
                          <button
                              on:click={generateOptInQrCode}
                              class="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 focus:ring-4 focus:ring-yellow-300"
                          >
                              Generate Opt-in QR Code
                          </button>
                          <button
                              on:click={() => checkOptIn(destinationAddress)}
                              class="px-4 py-2 text-sm font-medium text-yellow-600 bg-yellow-100 rounded-lg hover:bg-yellow-200 focus:ring-4 focus:ring-yellow-300"
                          >
                              Check Again
                          </button>
                        </div>
                        </div>
                    {:else}
                        <p class="text-sm text-green-600 dark:text-green-400">✓ Address is opted into {selectedToken.bridgedSymbol}</p>
                    {/if}
                    </div>
                {/if}
                </div>
            {:else}
              <div class="relative">
                <div class="relative">
                  <input
                    type="text"
                    bind:value={voiDestinationAddress}
                    bind:this={searchInputRef}
                    on:input={(e) => handleInput(e.currentTarget.value)}
                    on:keydown={handleKeydown}
                    on:focus={() => {
                      if (!voiDestinationAddress) {
                        showConnectedWallets = true;
                        showSearchResults = false;
                      }
                    }}
                    class="w-full px-3 py-2 md:py-2.5 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    placeholder="Enter address or search Envoi names..."
                    class:border-green-500={isValidDestination}
                    class:border-red-500={destinationAddress && !isValidDestination}
                  />
                  {#if voiDestinationAddress}
                    <button
                      type="button"
                      class="absolute inset-y-0 right-0 pr-3 flex items-center"
                      aria-label="Clear input"
                      on:click={() => {
                        voiDestinationAddress = '';
                        resolvedName = null;
                        isValidDestination = false;
                        showSearchResults = false;
                        showConnectedWallets = true;
                      }}
                    >
                      <svg class="w-4 h-4 text-gray-500 hover:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  {/if}
                </div>

                {#if showConnectedWallets && uniqueConnectedWallets.length > 0 && !voiDestinationAddress}
                  <div 
                    bind:this={searchDropdownRef}
                    class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 md:max-h-60"
                  >
                    <ul class="max-h-48 overflow-auto py-1">
                      {#each uniqueConnectedWallets as address, i}
                        <li>
                          <button
                            class="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                            on:click={() => {
                              voiDestinationAddress = address;
                              isValidDestination = true;
                              showConnectedWallets = false;
                              // Try to resolve Envoi name
                              getEnvoiNames([address]).then(results => {
                                if (results.length > 0) {
                                  resolvedName = {
                                    name: results[0].name,
                                    address: results[0].address,
                                    avatar: results[0].metadata.avatar || undefined
                                  };
                                }
                              });
                            }}
                          >
                            <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900">
                              <svg class="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div class="min-w-0 flex-1">
                              <div class="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {address}
                              </div>
                            </div>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if showSearchResults && searchResults.length > 0}
                  <div 
                    bind:this={searchDropdownRef}
                    class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 md:max-h-60"
                  >
                    <ul class="max-h-60 overflow-auto py-1">
                      {#each searchResults as result, i}
                        <li>
                          <button
                            class="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                            class:bg-gray-100={i === selectedSearchIndex}
                            class:dark:bg-gray-700={i === selectedSearchIndex}
                            on:click={() => selectSearchResult(result)}
                          >
                            <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                              {#if ('owner' in result && (result.properties?.verified?.avatar || result.properties?.userDefined?.avatar)) || ('avatar' in result && result.avatar)}
                                <img 
                                  src={'owner' in result ? getAvatarUrl(result) : result.avatar}
                                  alt="Avatar"
                                  class="w-full h-full object-cover"
                                  on:error={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    target.style.display = 'none';
                                    (target.nextElementSibling as HTMLDivElement).style.display = 'flex';
                                  }}
                                />
                              {:else}
                                <div 
                                  class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-lg font-medium"
                                >
                                  {getInitials('owner' in result ? result.name : result.name)}
                                </div>
                              {/if}
                            </div>
                            <div class="min-w-0 flex-1">
                              <div class="font-medium text-gray-900 dark:text-white truncate">
                                {result.name}
                              </div>
                              <div class="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {'owner' in result ? result.owner : result.address}
                              </div>
                            </div>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if resolvedName}
                  <div class="mt-2 flex items-center space-x-2">
                    <div class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {#if resolvedName.avatar}
                        <img 
                          src={resolvedName.avatar}
                          alt="Avatar"
                          class="w-full h-full object-cover"
                          on:error={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.style.display = 'none';
                            (target.nextElementSibling as HTMLDivElement).style.display = 'flex';
                          }}
                        />
                      {:else}
                        <div 
                          class="w-full h-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium"
                        >
                          {getInitials(resolvedName.name)}
                        </div>
                      {/if}
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {resolvedName.name}
                    </p>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Amount Input -->
          <div class="space-y-2">
            <label for="amount" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Amount <span class={isVoiToAlgorand ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-blue-600 dark:text-blue-400 font-semibold"}>
                ({ isVoiToAlgorand ? selectedToken.symbol : selectedToken.bridgedSymbol })
              </span>
            </label>
            {#if isVoiToAlgorand}
              <div class="mb-2">
                {#if isLoadingBalance}
                  <p class="text-sm text-gray-500 dark:text-gray-400">Loading balance...</p>
                {:else if voiBalance !== null}
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Available balance: {voiBalance.toFixed(6)} {isVoiToAlgorand ? selectedToken.symbol : selectedToken.bridgedSymbol}
                  </p>
                {/if}
              </div>
            {/if}
            <input
              type="number"
              bind:value={amount}
              min="0"
              step="0.000001"
              class="w-full p-2.5 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              placeholder="Enter amount"
            />
            <div class="space-y-1">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Bridge fee: {displayFeeAmount.toFixed(6)} {isVoiToAlgorand ? selectedToken.symbol : selectedToken.bridgedSymbol} (0.1%)
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                You will receive: {displayDestinationAmount.toFixed(6)} {isVoiToAlgorand ? selectedToken.bridgedSymbol : selectedToken.symbol}
              </p>
            </div>
          </div>
          {#if !isVoiToAlgorand}
            <div class="text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">You will scan the generated QR code or open the link with your Algorand wallet</p>
            </div>
          {/if}

          <!-- QR Code Modal -->
          <Modal bind:open={showQrCode} size="sm" autoclose={false}>
            <div class="p-3 md:p-4">
              <div class="flex justify-between items-center mb-3 md:mb-4">
                <h3 class="text-lg md:text-xl font-medium text-gray-900 dark:text-white">Scan QR Code</h3>
              </div>
              
              <div class="flex flex-col items-center space-y-3 md:space-y-4">
                <img src={qrCodeDataUrl} alt="Bridge QR Code" class="w-56 h-56 md:w-64 md:h-64" />
                <div class="flex flex-col items-center gap-2">
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Scan this QR code with Pera Wallet or Defly Wallet
                  </p>
                  {#if isMonitoringAlgorand}
                    <p class="text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                      Monitoring for transaction on Algorand{monitoringDots}
                    </p>
                  {/if}
                  <a
                    href={peraWalletUrl}
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300"
                  >
                    Open in Pera or Defly Wallet
                  </a>
                </div>
              </div>
            </div>
          </Modal>

          <!-- Opt-in QR Code Modal -->
          <Modal bind:open={showOptInQrCode} size="sm" autoclose={false} on:close={handleOptInQrCodeClose}>
            <div class="p-4">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-medium text-gray-900 dark:text-white">Opt-in to aVOI</h3>
              </div>
              
              <div class="flex flex-col items-center space-y-4">
                <img src={optInQrCodeDataUrl} alt="Opt-in QR Code" class="w-64 h-64" />
                <div class="flex flex-col items-center gap-2">
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Scan this QR code with Pera Wallet or Defly Wallet to opt into aVOI
                  </p>
                  <a
                    href={`perawallet://?amount=0&asset=${selectedToken.algorandAssetId}`}
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300"
                  >
                    Open in Pera or Defly Wallet
                  </a>
                </div>
              </div>
            </div>
          </Modal>
        </div>
      {:else}
        <div class="space-y-6">
          <!-- Bridge Status Header -->
          <div class="text-center">
            {#if bridgeStatus === 'signing'}
              <h4 class="text-lg font-medium text-gray-900 dark:text-white">Sign Transaction</h4>
              {#if isVoiToAlgorand}
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Please review and sign the transaction in your <span class="text-emerald-600 dark:text-emerald-400 font-medium">VOI Network</span> wallet
                </p>
              {:else}
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Please scan the QR code with your <span class="text-blue-600 dark:text-blue-400 font-medium">Algorand</span> wallet (Pera or Defly) to create and sign the transaction
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">You can also click "Open in Pera or Defly Wallet" if you're on mobile</p>
              {/if}
            {:else if bridgeStatus === 'submitting'}
              <h4 class="text-lg font-medium text-gray-900 dark:text-white">Submitting Transaction</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Submitting to the <span class={isVoiToAlgorand ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-blue-600 dark:text-blue-400 font-medium"}>
                  {isVoiToAlgorand ? 'VOI Network' : 'Algorand'}
                </span> network...
              </p>
            {:else if bridgeStatus === 'bridging' || bridgeStatus === 'completed'}
              <h4 class="text-lg font-medium text-gray-900 dark:text-white">
                {bridgeStatus === 'bridging' ? 'Bridging in Progress' : 'Bridge Complete'}
              </h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {bridgeStatus === 'bridging' ? 'Your tokens are being bridged...' : 'Your tokens have been bridged successfully!'}
              </p>
            {:else if bridgeStatus === 'error'}
              <h4 class="text-lg font-medium text-red-600 dark:text-red-400">Bridge Error</h4>
              <p class="text-sm text-red-500 dark:text-red-400">{bridgeError || 'An error occurred during the bridge process'}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "Back" to try again</p>
            {/if}
          </div>

          <!-- Bridge Animation -->
          {#if bridgeStatus === 'bridging' || bridgeStatus === 'completed'}
            <BridgeAnimation 
              direction={selectedDirection}
              status={bridgeStatus === 'completed' ? 'completed' : 'bridging'}
              sourceToken={isVoiToAlgorand ? selectedToken.symbol : selectedToken.bridgedSymbol}
              destinationToken={isVoiToAlgorand ? selectedToken.bridgedSymbol : selectedToken.symbol}
            />
          {/if}

          <!-- Transaction Details -->
          {#if bridgeDetails}
            <div class="space-y-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div>
                <label for="sourceTxId" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Source Transaction ID (on {isVoiToAlgorand ? 'Voi' : 'Algorand'})</label>
                <div class="mt-1 flex items-center space-x-2">
                  <code id="sourceTxId" class="text-sm bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">{bridgeDetails.sourceTxId}</code>
                  <a
                    href={isVoiToAlgorand ? `https://explorer.voi.network/explorer/transaction/${bridgeDetails.sourceTxId}` : `https://allo.info/tx/${bridgeDetails.sourceTxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-500 hover:text-blue-600"
                  >
                    View
                  </a>
                </div>
              </div>

              {#if bridgeDetails.destinationTxId}
                <div>
                  <label for="destinationTxId" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Destination Transaction ID (on {!isVoiToAlgorand ? 'Voi' : 'Algorand'})</label>
                  <div class="mt-1 flex items-center space-x-2">
                    <code id="destinationTxId" class="text-sm bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">{bridgeDetails.destinationTxId}</code>
                    <a
                      href={!isVoiToAlgorand ? `https://explorer.voi.network/explorer/transaction/${bridgeDetails.destinationTxId}` : `https://allo.info/tx/${bridgeDetails.destinationTxId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-blue-500 hover:text-blue-600"
                    >
                      View
                    </a>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Fixed Footer -->
    <div class="p-3 md:p-6 pt-3 md:pt-4 border-t border-gray-200 dark:border-gray-700">
      {#if bridgeStatus === 'idle'}
        <div class="flex justify-end space-x-3 md:space-x-4">
          <button
            on:click={closeModal}
            class="px-3 py-2 md:px-4 md:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:ring-4 focus:ring-gray-300 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            on:click={handleSubmit}
            disabled={submitButtonDisabled}
            title={submitButtonTooltip}
            class="px-3 py-2 md:px-4 md:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVoiToAlgorand ? 'Bridge to Algorand' : 'Generate QR Code'}
          </button>
        </div>
      {:else}
        <div class="flex justify-end space-x-3 md:space-x-4">
          {#if bridgeStatus === 'completed'}
            <button
              on:click={() => {
                resetBridgeState();
                amount = '';
                algorandDestinationAddress = '';
                voiDestinationAddress = '';
                resolvedName = null;
                isValidDestination = false;
                showSearchResults = false;
                searchResults = [];
                // Also reset source address state if it exists
                algorandSourceAddress = '';
                algorandSourceResolvedName = null;
                isValidSourceAddress = false;
                showSourceSearchResults = false;
                sourceSearchResults = [];
                algorandSourceBalance = null;
              }}
              class="px-3 py-2 md:px-4 md:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300"
            >
              Bridge Again
            </button>
            <button
              on:click={closeModal}
              class="px-3 py-2 md:px-4 md:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:ring-4 focus:ring-gray-300 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              Close
            </button>
          {:else if bridgeStatus === 'bridging'}
            <button
              on:click={closeModal}
              class="px-3 py-2 md:px-4 md:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:ring-4 focus:ring-gray-300 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              Close
            </button>
          {:else}
            <button
              on:click={goBack}
              class="px-3 py-2 md:px-4 md:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:ring-4 focus:ring-gray-300 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              Back
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</Modal> 