<script lang="ts">
    const mexcReferralLink = "https://promote.mexc.com/r/CmlhP6bu";
    
  // Exchange links
  const links = {
    // Voi Network
    humbleswap: "https://voi.humble.sh/#/swap?poolId=395553",
    nomadex: "https://voi.nomadex.app/1/302190/0/0",
    
    // Algorand
    tinyman: "https://app.tinyman.org/swap?asset_in=31566704&asset_out=2320775407",
    pactfi: "https://app.pact.fi/swap?pair=USDC:31566704/ARAMID+VOI:2320775407",
    algoVoiBridge: "https://www.aramid.finance/",
    
    // Base
    uniswap: "https://app.uniswap.org/explore/tokens/base/0xb40c776253c4bbc18a9e635acc183359e5fa22f9",
    baseVoiBridge: "https://www.aramid.finance/",
    
    // MEXC
    mexc: "https://www.mexc.com/exchange/VOI_USDT"
  };

</script>

<div class="bg-gradient-to-br from-purple-600 to-blue-500 dark:from-purple-900 dark:to-blue-800 rounded-lg shadow-xl overflow-hidden">
  <div class="flex flex-col md:flex-row">
    <!-- Left side: Main image and headline -->
    <div class="w-full md:w-1/3 p-2 md:p-6 flex flex-row md:flex-col justify-start md:justify-center items-center text-center md:text-center">
      <div class="w-16 md:w-auto mb-0 md:mb-4 transform hover:scale-110 transition-transform duration-300 mr-3 md:mr-0">
        <img src="/logos/voi_logo.png" alt="VOI Token" class="hidden dark:block w-16 md:w-64 filter drop-shadow-xl dark:drop-shadow-2xl" />
        <img src="/logos/voi_logo2.png" alt="VOI Token" class="dark:hidden w-16 md:w-64 filter drop-shadow-xl dark:drop-shadow-2xl" />
      </div>
      <div class="flex flex-col items-start md:items-center">
        <h2 class="text-xl md:text-4xl font-bold text-white mb-0 md:mb-2">Got VOI?</h2>
        <p class="hidden md:block text-base md:text-lg text-white/90">Multiple ways to get the token powering Voi Network</p>
        <a href="/markets" class="text-xs md:text-base text-white/90 hover:text-white underline decoration-dotted transition-colors duration-200">
          Market stats →
        </a>
      </div>
    </div>
    
    <!-- Right side: Exchange options -->
    <div class="w-full md:w-2/3 bg-white/10 dark:bg-gray-900/20 backdrop-blur-sm p-2 md:p-6">
      <div class="grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-2 md:gap-4">
        <!-- Primary option: MEXC -->
        <div class="col-span-2 md:col-span-1 lg:col-span-2 bg-white/20 dark:bg-gray-800/30 rounded-lg p-2 md:p-4 hover:bg-white/30 dark:hover:bg-gray-800/40 transition-colors duration-200">
          <div class="flex items-center gap-2 mb-1 md:mb-2">
            <div class="w-6 h-6 md:w-10 md:h-10 rounded-full bg-white/90 dark:bg-gray-800/90 flex items-center justify-center">
              <img src="/logos/mexc_logo.png" alt="MEXC" class="w-4 h-4 md:w-6 md:h-6" />
            </div>
            <h3 class="text-base md:text-xl font-bold text-white">Buy VOI on MEXC</h3>
            <div class="ml-auto">
              <span class="bg-green-500 dark:bg-green-600 text-white text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full uppercase font-semibold">Recommended</span>
            </div>
          </div>
          <p class="hidden md:block text-sm md:text-base text-white/80 mb-2 md:mb-3">The easiest way to buy VOI with the highest liquidity</p>
          <div class="flex flex-wrap gap-1.5 md:gap-2">
            <a href={mexcReferralLink} target="_blank" rel="noopener noreferrer" 
               class="text-xs md:text-base inline-block bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-medium px-2 md:px-4 py-1 md:py-2 rounded-lg transition-colors duration-200">
              Sign up →
            </a>
            <a href={links.mexc} target="_blank" rel="noopener noreferrer" 
               class="text-xs md:text-base inline-block bg-white/20 hover:bg-white/30 dark:bg-gray-700/50 dark:hover:bg-gray-700/60 text-white font-medium px-2 md:px-4 py-1 md:py-2 rounded-lg transition-colors duration-200">
              Trade
            </a>
          </div>
        </div>

        <!-- Option 1: Voi DEXes -->
        <div class="bg-white/20 dark:bg-gray-800/30 rounded-lg p-2 md:p-4 hover:bg-white/30 dark:hover:bg-gray-800/40 transition-colors duration-200">
          <h3 class="text-sm md:text-lg font-semibold text-white mb-1 md:mb-2">On Voi Network</h3>
          <p class="hidden md:block text-sm md:text-base text-white/80 mb-2 md:mb-3">Swap directly on Voi Network DEXes</p>
          <div class="flex flex-wrap gap-1 md:gap-2">
            <a href={links.humbleswap} target="_blank" rel="noopener noreferrer" 
               class="bg-white/30 dark:bg-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/60 text-white text-[10px] md:text-sm px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg transition-colors duration-200">
              HumbleSwap
            </a>
            <a href={links.nomadex} target="_blank" rel="noopener noreferrer" 
               class="bg-white/30 dark:bg-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/60 text-white text-[10px] md:text-sm px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg transition-colors duration-200">
              Nomadex
            </a>
          </div>
        </div>

        <!-- Option 2: Algorand -->
        <div class="bg-white/20 dark:bg-gray-800/30 rounded-lg p-2 md:p-4 hover:bg-white/30 dark:hover:bg-gray-800/40 transition-colors duration-200">
          <h3 class="text-sm md:text-lg font-semibold text-white mb-1 md:mb-2">From Algorand</h3>
          <p class="hidden md:block text-sm md:text-base text-white/80 mb-2 md:mb-3">Buy aVOI on Algorand and bridge to Voi</p>
          <div class="flex flex-wrap gap-1 md:gap-2">
            <a href={links.tinyman} target="_blank" rel="noopener noreferrer" 
               class="bg-white/30 dark:bg-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/60 text-white text-[10px] md:text-sm px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg transition-colors duration-200">
              Tinyman
            </a>
            <a href={links.pactfi} target="_blank" rel="noopener noreferrer" 
               class="bg-white/30 dark:bg-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/60 text-white text-[10px] md:text-sm px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg transition-colors duration-200">
              PactFi
            </a>
            <a href={links.algoVoiBridge} target="_blank" rel="noopener noreferrer" 
               class="bg-white/30 dark:bg-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/60 text-white text-[10px] md:text-sm px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg transition-colors duration-200">
              Bridge
            </a>
          </div>
        </div>

        <!-- Option 3: Base -->
        <div class="bg-white/20 dark:bg-gray-800/30 rounded-lg p-2 md:p-4 hover:bg-white/30 dark:hover:bg-gray-800/40 transition-colors duration-200">
          <h3 class="text-sm md:text-lg font-semibold text-white mb-1 md:mb-2">From Base</h3>
          <p class="hidden md:block text-sm md:text-base text-white/80 mb-2 md:mb-3">Buy aVOI on Base and bridge to Voi</p>
          <div class="flex flex-wrap gap-1 md:gap-2">
            <a href={links.uniswap} target="_blank" rel="noopener noreferrer" 
               class="bg-white/30 dark:bg-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/60 text-white text-[10px] md:text-sm px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg transition-colors duration-200">
              Uniswap
            </a>
            <a href={links.baseVoiBridge} target="_blank" rel="noopener noreferrer" 
               class="bg-white/30 dark:bg-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/60 text-white text-[10px] md:text-sm px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg transition-colors duration-200">
              Bridge
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div> 