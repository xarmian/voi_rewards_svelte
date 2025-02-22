<script lang="ts">
    export let walletAddress: string;

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };
</script>

<div class="space-y-6">
    <div class="space-y-3">
        <p class="text-gray-600 dark:text-gray-400">
            For detailed instructions on installing and operating a Voi Swarm node, see the 
            <a 
                href="https://voinetwork.github.io/voi-swarm/"
                class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                target="_blank"
                rel="noopener noreferrer"
            >
                Voi Swarm documentation
            </a>.
        </p>
    </div>

    <div class="space-y-3">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">1. Generate Participation Key</h3>
        <p class="text-gray-600 dark:text-gray-400">
            Generate a participation key for your account.
        </p>
        <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <code class="text-sm font-mono dark:text-white">
                    ~/voi/bin/generate-participation-key {walletAddress}
                </code>
                <button
                    class="ml-2 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    on:click={() => copyToClipboard(`~/voi/bin/generate-participation-key ${walletAddress}`)}
                    title="Copy to clipboard"
                    aria-label="Copy to clipboard"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </button>
            </div>
        </div>
    </div>

    <div class="space-y-3">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">2. View Participation Key Details</h3>
        <p class="text-gray-600 dark:text-gray-400">
            View the details of your participation key.
        </p>
        <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <code class="text-sm font-mono dark:text-white">
                    ~/voi/bin/goal account partkeyinfo
                </code>
                <button
                    class="ml-2 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    on:click={() => copyToClipboard('~/voi/bin/goal account partkeyinfo')}
                    title="Copy to clipboard"
                    aria-label="Copy to clipboard"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </button>
            </div>
        </div>
    </div>

    <div class="space-y-3">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">3. Copy Key Information</h3>
        <p class="text-gray-600 dark:text-gray-400">
            Copy the entire key information block that appears after running the command above. The block will contain details like Participation ID, Parent address, and various keys. Use the "Paste All from Clipboard" button to paste this information into the form below.
        </p>
        <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <p class="text-sm text-gray-600 dark:text-gray-400">Example format:</p>
            <pre class="text-sm font-mono mt-2 whitespace-pre-wrap dark:text-white">
Participation ID:          AOEZ2UIMKR3XNMTUSAKJJ2VKAU3FQPKJLSITW32DK5SNTQ2FG3QQ
Parent address:            NPXMG3RB33CCFIKVDMJZIKARYE7MPEPXCKZJERNAEMKHGSWS2GC6W5O2ZQ
Last vote round:           5026835
Last block proposal round: 5026621
Effective first round:     3047662
Effective last round:      8047143
First round:               3047143
Last round:                8047143
Key dilution:              2237
Selection key:             jsNw/NIrOVlnYESOQk1XDXTA/TugvMLG/4mvZTuz1Ik=
Voting key:                DBQAnaGIEGMigiaQh4zec4XMg+SkItt49ua2QUaeAeE=
State proof key:           wLM3N1RWc+WLU3PKng5ZS5gKhG9Xu+EAkdL2ztBzcj2Er43mWlwSptoIjNMlI5AYJeUeRtL7kfCS8y3u3eMeHw==</pre>
        </div>
    </div>
</div> 