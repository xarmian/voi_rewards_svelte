<script lang="ts">
  import { onMount } from 'svelte';
  import { Web3Wallet, signTransactions, selectedWallet } from 'avm-wallet-svelte';
  import algosdk from 'algosdk';
  import { algodClient, algodIndexer } from '$lib/utils/algod';
  import { PUBLIC_WALLETCONNECT_PROJECT_ID as wcProjectId } from '$env/static/public';

  // Worker instance - needs to be accessible outside generateVanityAddress
  let worker: Worker | null = null; 

  // Form state
  let prefix = '';
  let suffix = '';
  let isGenerating = false;
  let progress = 0;
  let attempts = 0;
  let result: { address: string; mnemonic: string } | null = null;
  let error: string | null = null;
  let maxAttempts = 10000000; // Safety limit
  let startTime: number | null = null;
  let elapsedTime = 0;
  let attemptsPerSecond = 0;
  let estimatedTimeRemaining = '';
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let lastAddressCheckedByWorker: string | null = null; // Track last checked address

  // Wallet and rekey state
  let isActivating = false;
  let isRekeying = false;
  let txnStatus: 'idle' | 'sending' | 'success' | 'error' = 'idle';
  let rekeyTxnStatus: 'idle' | 'sending' | 'success' | 'error' = 'idle';
  let txnError: string | null = null;
  
  // Method to validate inputs
  function validateInputs(): boolean {
    error = null;
    
    // Check if at least one of prefix or suffix is provided
    if (!prefix && !suffix) {
      error = 'Please specify at least a prefix or suffix for the address';
      return false;
    }

    // Check if inputs are alphanumeric
    const alphanumericRegex = /^[a-zA-Z0-9]*$/;
    if (prefix && !alphanumericRegex.test(prefix)) {
      error = 'Prefix must contain only letters and numbers';
      return false;
    }

    if (suffix && !alphanumericRegex.test(suffix)) {
      error = 'Suffix must contain only letters and numbers';
      return false;
    }

    // Check reasonable length
    if (prefix.length > 10) {
      error = 'Prefix is too long (max 10 characters)';
      return false;
    }

    if (suffix.length > 10) {
      error = 'Suffix is too long (max 10 characters)';
      return false;
    }

    // Check for valid Voi base32 characters if searching by suffix or prefix
    const base32Regex = /^[A-Z2-7]*$/i;
    
    if (suffix && !base32Regex.test(suffix)) {
      error = 'Suffix must contain only valid Voi address characters (A-Z, 2-7)';
      return false;
    }

    if (prefix && !base32Regex.test(prefix)) {
      error = 'Prefix must contain only valid Voi address characters (A-Z, 2-7)';
      return false;
    }
    
    // Add a warning about suffix search difficulty
    if (suffix && suffix.length > 3) {
      error = 'Warning: Finding an address with a 4+ character suffix may take an extremely long time due to checksum constraints. Consider using a shorter suffix or only a prefix.';
      return false;
    }

    return true;
  }

  // Update progress statistics
  function updateStats() {
    if (!startTime) return;
    
    const now = Date.now();
    elapsedTime = (now - startTime) / 1000; // in seconds
    attemptsPerSecond = attempts / elapsedTime;
    
    // Estimate completion time if we can
    if (attemptsPerSecond > 0) {
      // Rough probability estimation based on attempt rate and character space (A-Z, 0-9 -> 36)
      // Voi uses Base32 (A-Z, 2-7 -> 32), but we'll stick with 36 for a simpler (though less accurate) calculation for now
      let validChars = prefix.length + suffix.length;
      let probabilityPerAttempt = 1 / (36 ** validChars); // Very rough!
      let estimatedAttemptsNeeded = 1 / probabilityPerAttempt;
      let remainingAttempts = Math.max(0, estimatedAttemptsNeeded - attempts);
      let remainingTimeInSeconds = remainingAttempts / attemptsPerSecond;
      
      if (remainingTimeInSeconds === Infinity || isNaN(remainingTimeInSeconds)) {
        estimatedTimeRemaining = 'Very long time...';
      } else if (remainingTimeInSeconds > 86400 * 30) { // More than 30 days
        estimatedTimeRemaining = `${(remainingTimeInSeconds / 86400).toFixed(0)}+ days`;
      } else if (remainingTimeInSeconds > 86400) {
        estimatedTimeRemaining = `${(remainingTimeInSeconds / 86400).toFixed(1)} days`;
      } else if (remainingTimeInSeconds > 3600) {
        estimatedTimeRemaining = `${(remainingTimeInSeconds / 3600).toFixed(1)} hours`;
      } else if (remainingTimeInSeconds > 60) {
        estimatedTimeRemaining = `${(remainingTimeInSeconds / 60).toFixed(1)} minutes`;
      } else {
        estimatedTimeRemaining = `${remainingTimeInSeconds.toFixed(0)} seconds`;
      }
    } else {
      estimatedTimeRemaining = 'Calculating...';
    }
  }

  // Generate the vanity address
  async function generateVanityAddress() {
    if (!validateInputs()) return;

    // Reset state
    isGenerating = true;
    attempts = 0;
    progress = 0;
    result = null;
    error = null; // Clear previous errors
    lastAddressCheckedByWorker = null; // Clear last checked address
    startTime = Date.now();
    if (updateInterval) clearInterval(updateInterval); // Clear previous interval if any
    if (worker) worker.terminate(); // Terminate any previous worker

    // Start the progress update interval
    updateInterval = setInterval(updateStats, 1000);

    try {
      // Create a worker for better performance and to avoid blocking the UI
      worker = new Worker(
        URL.createObjectURL(
          new Blob(
            [
              `
              self.onmessage = function(e) {
                const { prefix, suffix, maxAttempts } = e.data;
                
                // Import AlgoSDK (must be included in the worker)
                importScripts('https://cdn.jsdelivr.net/npm/algosdk@2.9.0/dist/browser/algosdk.min.js');
                
                let attempts = 0;
                let foundMatch = false;
                let lastAddressChecked = ''; // Track the last generated address

                const prefixLower = prefix.toLowerCase();
                const suffixLower = suffix.toLowerCase();

                while (!foundMatch && attempts < maxAttempts) {
                  // Generate an account
                  const account = algosdk.generateAccount();
                  const address = account.addr;
                  const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
                  
                  attempts++;
                  lastAddressChecked = address; // Update last checked address

                  // Send progress update every 1000 attempts
                  if (attempts % 1000 === 0) {
                    self.postMessage({ 
                      type: 'progress', 
                      attempts,
                      lastAddressChecked // Send the latest address checked
                    });
                  }
                  
                  // Check if it matches our conditions - always ignore case
                  const addressLower = address.toLowerCase();
                  
                  const matchesPrefix = !prefixLower || addressLower.startsWith(prefixLower);
                  const matchesSuffix = !suffixLower || addressLower.endsWith(suffixLower);
                  
                  if (matchesPrefix && matchesSuffix) {
                    self.postMessage({ 
                      type: 'result', 
                      address, 
                      mnemonic,
                      attempts 
                    });
                    foundMatch = true;
                  }
                }
                
                if (!foundMatch) {
                  self.postMessage({ 
                    type: 'maxAttempts', 
                    attempts,
                    lastAddressChecked // Include last checked on max attempts too
                  });
                }
              };
              `
            ],
            { type: 'application/javascript' }
          )
        )
      );

      // Set up event listeners
      worker.onmessage = (e) => {
        const data = e.data;
        
        if (data.type === 'progress') {
          attempts = data.attempts;
          progress = (attempts / maxAttempts) * 100;
          lastAddressCheckedByWorker = data.lastAddressChecked; // Update displayed last address
          updateStats();
        } else if (data.type === 'result') {
          attempts = data.attempts;
          result = {
            address: data.address,
            mnemonic: data.mnemonic
          };
          isGenerating = false; // Set generating to false *before* cleanup
          
          // Stop the worker and interval
          if (worker) {
            worker.terminate();
            worker = null;
          }
          if (updateInterval) clearInterval(updateInterval);
          updateInterval = null;

        } else if (data.type === 'maxAttempts') {
          attempts = data.attempts;
          error = `Reached maximum attempts (${maxAttempts.toLocaleString()}) without finding a match.`;
          lastAddressCheckedByWorker = data.lastAddressChecked;
          isGenerating = false; // Set generating to false *before* cleanup

          // Stop the worker and interval
          if (worker) {
            worker.terminate();
            worker = null;
          }
          if (updateInterval) clearInterval(updateInterval);
          updateInterval = null;
        }
      };
      
      worker.onerror = (err) => {
        console.error("Worker error:", err);
        error = `Worker error: ${err.message}`;
        isGenerating = false;
        if (worker) {
          worker.terminate();
          worker = null;
        }
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = null;
      };

      // Start the worker
      worker.postMessage({
        prefix,
        suffix,
        maxAttempts
      });
    } catch (err) {
      console.error("Error setting up worker:", err);
      isGenerating = false;
      error = `Error: ${err instanceof Error ? err.message : String(err)}`;
      if (worker) {
        worker.terminate();
        worker = null;
      }
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  // Stop the search
  function stopSearch() {
    isGenerating = false;
    if (worker) {
      worker.terminate(); // Terminate the worker
      worker = null; // Clear the worker reference
    }
    if (updateInterval) {
      clearInterval(updateInterval); // Clear the interval
      updateInterval = null;
    }
    // Optionally provide feedback that the search was stopped
    if (attempts > 0 && !result) {
       error = `Search stopped after ${attempts.toLocaleString()} attempts.`;
    }
    // Reset stats that might be misleading now
    estimatedTimeRemaining = '';
    attemptsPerSecond = 0;
  }

  // Copy text to clipboard
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      // Maybe add a small visual confirmation?
    } catch (err) {
      console.error('Failed to copy: ', err);
      // Maybe show a temporary error message?
    }
  }

  // Send 1 VOI to activate the vanity address
  async function activateVanityAddress() {
    if (!$selectedWallet?.address || $selectedWallet?.app === 'Watch' || !result) {
      error = 'Please connect a wallet first';
      return;
    }

    isActivating = true;
    txnStatus = 'sending';
    txnError = null;

    try {
      // Get parameters for the transaction
      const params = await algodClient.getTransactionParams().do();
      
      // Create an unsigned transaction to send 1 VOI to the vanity address
      // 1 VOI = 1,000,000 microVOI
      const unsignedTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: $selectedWallet.address,
        to: result.address,
        amount: 1000000, // 1 VOI in microVOI
        suggestedParams: params
      });

      // Ask user to sign the transaction
      const signedTxns = await signTransactions([[unsignedTxn]]);
      
      // Send the signed transaction to the network
      const { txId } = await algodClient.sendRawTransaction(signedTxns).do();
      
      // Wait for confirmation
      await algosdk.waitForConfirmation(algodClient, txId, 5);
      
      txnStatus = 'success';
      
      // After sending 1 VOI, we can now initiate the rekey transaction
      await rekeyVanityAddress();
      
    } catch (err) {
      console.error('Failed to activate address:', err);
      txnStatus = 'error';
      txnError = err instanceof Error ? err.message : String(err);
    } finally {
      isActivating = false;
    }
  }

  // Rekey the vanity address
  async function rekeyVanityAddress() {
    if (!result || !$selectedWallet?.address) return;
    
    isRekeying = true;
    rekeyTxnStatus = 'sending';
    
    try {
      // Get parameters for the transaction
      const params = await algodClient.getTransactionParams().do();
      
      // Convert the mnemonic to a keypair for signing
      const vanityAccount = algosdk.mnemonicToSecretKey(result.mnemonic);
      
      // Create a rekey transaction to point to the user's connected wallet address
      const rekeyTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: result.address,
        to: result.address, // Send to self
        amount: 0, // Zero amount for rekey
        suggestedParams: params,
        rekeyTo: $selectedWallet.address // Rekey to connected wallet
      });
      
      // Sign the transaction with the vanity address secret key
      const signedRekeyTxn = rekeyTxn.signTxn(vanityAccount.sk);
      
      // Send the signed transaction to the network
      const { txId } = await algodClient.sendRawTransaction(signedRekeyTxn).do();
      
      // Wait for confirmation
      await algosdk.waitForConfirmation(algodClient, txId, 5);
      
      rekeyTxnStatus = 'success';
      
    } catch (err) {
      console.error('Failed to rekey address:', err);
      rekeyTxnStatus = 'error';
      txnError = err instanceof Error ? err.message : String(err);
    } finally {
      isRekeying = false;
    }
  }

  // Clean up on unmount
  onMount(() => {
    // Import font awesome - consider adding this via a layout or app.html
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
    document.head.appendChild(link);

    return () => {
      if (updateInterval) clearInterval(updateInterval);
      if (worker) {
         worker.terminate(); // Ensure worker is terminated on component destroy
         worker = null;
      }
      // Remove font awesome link if it's only needed here
      // document.head.removeChild(link); 
    };
  });
</script>

<svelte:head>
  <title>Vanity Address Generator | Voi</title>
  <meta name="description" content="Generate a Voi vanity address with custom prefix and suffix" />
  <script src="https://cdn.jsdelivr.net/npm/algosdk@2.9.0/dist/browser/algosdk.min.js" defer></script>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
  <h1 class="text-3xl font-bold text-center mb-8 text-purple-900 dark:text-purple-300">
    Voi Vanity Address Generator
  </h1>
  
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
    <p class="text-gray-700 dark:text-gray-300 mb-6">
      Generate a Voi address that starts and/or ends with specific characters. Computation happens in your browser; keys are never sent anywhere.
    </p>
    
    <form on:submit|preventDefault={generateVanityAddress} class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label for="prefix" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Prefix (Start of address)
          </label>
          <input
            id="prefix"
            type="text"
            bind:value={prefix}
            placeholder="e.g. VOI"
            class="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={isGenerating}
            maxlength="10" 
            pattern="[a-zA-Z0-9]*"
            title="Prefix must contain only letters and numbers"
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Case-insensitive. Must be valid Base32 (A-Z, 2-7). Max 10 chars.
          </p>
        </div>
        
        <div>
          <label for="suffix" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Suffix (End of address)
          </label>
          <input
            id="suffix"
            type="text"
            bind:value={suffix}
            placeholder="e.g. 777"
            class="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={isGenerating}
            maxlength="10"
            pattern="[A-Z2-7]*"
            title="Suffix must contain only A-Z and 2-7"
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Case-insensitive. Must be valid Base32 (A-Z, 2-7). Max 10 chars.
          </p>
          <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
            <i class="fas fa-exclamation-triangle mr-1"></i> Note: Due to address checksum constraints, finding a specific suffix may be limited.
          </p>
        </div>
      </div>
      
      {#if !isGenerating}
        <button
          type="submit"
          class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition disabled:opacity-50"
          disabled={!prefix && !suffix}
        >
          Generate Vanity Address
        </button>
      {:else}
        <button
          type="button"
          on:click={stopSearch}
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition"
        >
          Stop Search
        </button>
      {/if}
    </form>
    
    {#if error}
      <div class="mt-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/50 dark:text-red-300 rounded">
        <p>{error}</p>
         {#if isGenerating && lastAddressCheckedByWorker}
           <p class="text-xs mt-1 font-mono">Last checked: {lastAddressCheckedByWorker}</p> 
         {/if}
      </div>
    {/if}
    
    {#if isGenerating}
      <div class="mt-6">
        <div class="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-2">
          <span>Progress: Checking addresses...</span>
          <span>{attempts.toLocaleString()} attempts</span>
        </div>
        <!-- Progress bar is less meaningful with random generation, maybe remove or change? -->
        <!-- <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-4">
          <div class="bg-purple-600 h-2.5 rounded-full" style="width: {progress}%"></div>
        </div> -->
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700 dark:text-gray-300 mt-4">
          <div>
            <span class="font-medium">Time elapsed:</span> {elapsedTime.toFixed(1)}s
          </div>
          <div>
            <span class="font-medium">Speed:</span> {attemptsPerSecond.toFixed(1)} addr/sec
          </div>
          <div>
            <span class="font-medium">Est. time:</span> {estimatedTimeRemaining || 'Calculating...'}
          </div>
        </div>
        {#if lastAddressCheckedByWorker}
          <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
            Last checked: {lastAddressCheckedByWorker}
          </div>
        {/if}
      </div>
    {/if}
    
    {#if result}
      <div class="mt-8 p-6 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 rounded-lg">
        <h3 class="text-xl font-medium text-green-800 dark:text-green-200 mb-4">
          <i class="fas fa-check-circle mr-2"></i>Address Found!
        </h3>
        
        <div class="mb-4">
          <div class="flex justify-between items-center">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Address:</span>
            <button
              on:click={() => result && copyToClipboard(result.address)}
              class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-sm px-2 py-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50"
              title="Copy address"
            >
              <i class="fas fa-copy mr-1"></i> Copy
            </button>
          </div>
          <div class="mt-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-md break-all font-mono text-sm">
            {result?.address || ''}
          </div>
        </div>
        
        <div>
          <div class="flex justify-between items-center">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Mnemonic (Secret Recovery Phrase):</span>
            <button
              on:click={() => result && copyToClipboard(result.mnemonic)}
              class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-sm px-2 py-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50"
              title="Copy mnemonic"
            >
              <i class="fas fa-copy mr-1"></i> Copy
            </button>
          </div>
          <div class="mt-1 p-3 bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700 rounded-md break-words font-mono text-sm">
            {result?.mnemonic || ''}
          </div>
        </div>
        
        <div class="mt-6 bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-200 p-4 rounded">
          <p class="font-bold flex items-center"><i class="fas fa-exclamation-triangle mr-2"></i>Important Security Notice</p>
          <p class="mt-1 text-sm">Save your mnemonic phrase securely offline. Never share it. Anyone with this phrase can access your funds.</p>
        </div>

        <!-- New section for wallet connection and rekey -->
        <div class="mt-6 border-t border-gray-200 dark:border-gray-600 pt-6">
          <h4 class="text-lg font-medium text-purple-800 dark:text-purple-300 mb-4">
            Secure Your Vanity Address
          </h4>
          
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-4">
            To use this address securely, you can rekey it to your primary wallet. This allows you to control the vanity address without exposing its private key.
          </p>
          
          <!-- Step 1: Connect Wallet -->
          <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h5 class="font-medium text-gray-800 dark:text-gray-200 mb-2">Step 1: Connect Your Main Wallet</h5>
            
              <Web3Wallet 
                availableWallets={['WalletConnect', 'Kibisis', 'LuteWallet', 'Biatec Wallet']}
                walletListClass="bg-gray-100 dark:bg-slate-600 dark:text-gray-200"
                allowWatchAccounts={false}
                showAuthenticated={false}
                modalType="dropdown"
                showAuthButtons={false}
                algodClient={algodClient}
                indexerClient={algodIndexer}
                wcProject={{
                    projectId: wcProjectId,
                    projectName: 'Voi Rewards Auditor',
                    projectDescription: 'Voi Rewards Auditor',
                    projectUrl: 'https://voirewards.com',
                    projectIcons: ['https://voirewards.com/android-chrome-192x192.png'],
                }}
              />
              {#if $selectedWallet?.address && $selectedWallet?.app !== 'Watch'}
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-green-600 dark:text-green-400 mr-2"><i class="fas fa-check-circle"></i></span>
                    <span class="font-mono text-sm truncate">Connected: {$selectedWallet.address}</span>
                  </div>
                </div>
              {/if}
          </div>
          
          <!-- Step 2: Fund and Rekey -->
          <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h5 class="font-medium text-gray-800 dark:text-gray-200 mb-2">Step 2: Fund & Rekey Address</h5>
            
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
              This process will send 1 VOI to your vanity address, then rekey it to your connected wallet.
            </p>
            
            {#if txnStatus === 'success' && rekeyTxnStatus === 'success'}
              <div class="bg-green-100 dark:bg-green-900/50 p-3 rounded-md text-green-800 dark:text-green-200 mb-3">
                <i class="fas fa-check-circle mr-2"></i> 
                Success! Your vanity address is now rekeyed to your connected wallet.
              </div>
            {:else}
              <button
                on:click={activateVanityAddress}
                disabled={!($selectedWallet?.address && $selectedWallet?.app !== 'Watch') || isActivating || isRekeying || txnStatus === 'sending' || rekeyTxnStatus === 'sending'}
                class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {#if isActivating || txnStatus === 'sending'}
                  <i class="fas fa-spinner fa-spin mr-2"></i> Funding Address...
                {:else if isRekeying || rekeyTxnStatus === 'sending'}
                  <i class="fas fa-spinner fa-spin mr-2"></i> Rekeying Address...
                {:else}
                  Fund & Rekey Address
                {/if}
              </button>
            {/if}
            
            {#if txnError}
              <div class="mt-3 p-3 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 rounded-md text-sm">
                <i class="fas fa-exclamation-circle mr-2"></i> {txnError}
              </div>
            {/if}
          </div>
          
          <!-- What happens next explanation -->
          {#if txnStatus === 'success' && rekeyTxnStatus === 'success'}
            <div class="p-4 bg-blue-50 dark:bg-blue-900/50 rounded-lg text-sm text-blue-800 dark:text-blue-200">
              <h5 class="font-medium mb-2">What Now?</h5>
              <p class="mb-2">Your vanity address is now fully set up:</p>
              <ul class="list-disc pl-5 space-y-1">
                <li>You can now use this address from your main wallet.</li>
                <li>The original seed phrase is no longer needed for signing transactions.</li>
                <li>Keep the seed phrase as a backup, but it's much more secure now.</li>
              </ul>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
    <h2 class="text-xl font-bold mb-4 text-purple-900 dark:text-purple-300">About Vanity Addresses</h2>
    
    <div class="space-y-4 text-gray-700 dark:text-gray-300 text-sm">
      <p>
        Vanity addresses are standard Voi addresses with a personalized touch, containing specific characters at the beginning or end. They function identically to regular addresses.
      </p>
      
      <p>
        <strong>Key Points:</strong>
      </p>
      
      <ul class="list-disc pl-5 space-y-2">
        <li>
          <strong>Difficulty Increases Exponentially:</strong> Each additional character you specify makes finding a match significantly harder (roughly 32 times harder per character due to Base32 encoding). Short prefixes/suffixes are much faster.
        </li>
        <li>
          <strong>Valid Characters:</strong> Voi addresses use Base32 encoding (A-Z and 2-7).
        </li>
        <li>
          <strong>Client-Side Generation:</strong> All calculations happen within your browser. Your secret mnemonic phrase is generated locally and is never transmitted over the network.
        </li>
        <li>
          <strong><span class="font-bold text-red-600 dark:text-red-400">Secure Your Mnemonic:</span></strong> Treat the generated mnemonic phrase like digital cash. Write it down, store it securely offline, and never share it. Loss of the mnemonic means loss of access to the address and any funds within it.
        </li>
         <li>
          <strong>Performance:</strong> Generation speed depends heavily on your computer's processing power. Complex patterns can take a very long time.
        </li>
      </ul>
    </div>
  </div>
</div>