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
            For detailed information about installation and operation of Func, see the 
            <a 
                href="https://github.com/GalaxyPay/func?tab=readme-ov-file#-funks-ultimate-node-controller-func"
                class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                target="_blank"
                rel="noopener noreferrer"
            >
                Func documentation
            </a>.
        </p>
    </div>

    <div class="space-y-3">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">1. Download FUNC</h3>
        <p class="text-gray-600 dark:text-gray-400">
            Download the FUNC installer for your operating system.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a 
                href="https://github.com/GalaxyPay/func/releases"
                class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
            >
                <i class="fab fa-windows text-xl text-blue-500"></i>
                <div>
                    <div class="font-medium text-gray-900 dark:text-white">Windows</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">.exe installer</div>
                </div>
            </a>
            <a 
                href="https://github.com/GalaxyPay/func/releases"
                class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
            >
                <i class="fab fa-apple text-xl text-gray-900 dark:text-white"></i>
                <div>
                    <div class="font-medium text-gray-900 dark:text-white">macOS</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">macOS installer</div>
                </div>
            </a>
            <a 
                href="https://github.com/GalaxyPay/func/releases"
                class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
            >
                <i class="fab fa-linux text-xl text-gray-900 dark:text-white"></i>
                <div>
                    <div class="font-medium text-gray-900 dark:text-white">Linux</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">Linux installer</div>
                </div>
            </a>
        </div>
    </div>

    <div class="space-y-3">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">2. Generate Participation Key</h3>
        <p class="text-gray-600 dark:text-gray-400">
            Generate a participation key for your account using Func.
        </p>
        <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <ol class="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
                <li>Open FUNC and wait for it to sync</li>
                <li>Find the "Participation Keys" header</li>
                <li>Click the "+" button to add a new participation key</li>
                <li>Enter your address: 
                    <div class="inline-flex items-center gap-2">
                        <code class="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{walletAddress}</code>
                        <button
                            class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            on:click={() => copyToClipboard(walletAddress)}
                            title="Copy to clipboard"
                            aria-label="Copy to clipboard"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </button>
                    </div>
                </li>
                <li>Once the key is generated, expand it to view all fields</li>
                <li>Copy each field value into the matching field in the form below and click "Register Key"</li>
            </ol>
        </div>
    </div>
</div> 