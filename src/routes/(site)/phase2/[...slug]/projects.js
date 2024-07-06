const projects = [
    {
        id: 0,
        title: "Social Quests",
        type: "Social Quests",
        category: "Social Quests",
        description: "Complete Social Quests on Galxe. Register your social media account(s) and perform qualifying activities to earn Quest Points",
        guide: "https://dashboard.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCr1MtdQcK",
        logo: "/logos/galxe.png",
        status: "active",
        realtime: true,
        quests: [ ]
    },
    {
        id: 1,
        title: "Voi Network",
        type: "Node Running",
        category: "Core",
        column: "network",
        description: "Run a participation node and help maintain the security and integrity of the Voi Network while earning Voi Points.",
        url: 'https://voi.network',
        guide: "https://voinetwork.github.io/voi-swarm/getting-started/introduction/",
        twitter: "https://x.com/Voi_Net",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCB1StzTo8",
        logo: '/logos/voi_logo.png',
        status: 'active',
        realtime: true,
        quests: [
            {
                id: 3,
                name: "run_a_node",
                title: "Run a Node",
                description: "Run a participation node on the Voi Network and earn points for each week the node remains online with a health score >= 5.0",
                status: null,
                reward: 1,
                frequency: "Weekly",
                guide: "https://voinetwork.github.io/voi-swarm/getting-started/introduction/"
            },
        ],
    },
    {
        id: 2,
        title: "Kibisis",
        type: "Wallet",
        category: "Wallets",
        column: "kibisis",
        description: "Get started with the Kibisis Browser Extension Wallet. Complete tasks on Kibisis to earn Voi Points.",
        url: "https://kibis.is",
        guide: "https://kibis.is/blog/the-voiage-to-mainnet",
        twitter: "https://x.com/kibisis_wallet",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCr1btzeG8",
        status: 'active',
        logo: '/logos/kibisis.png',
        realtime: true,
        quests: [
            {
                id: 1,
                title: "Social Media Quest",
                description: "Follow, like, and/or share Kibisis on social media",
                status: null,
                reward: 1,
                guide: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GC9Nbtzpzz",
            },
            {
                id: 2,
                name: "send-native-currency-action",
                title: "Send $VOI to a Friend",
                description: "Send $VOI to another wallet using Kibisis",
                status: null,
                reward: 1,
                guide: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCAnctzNGv",
                frequency: "Daily",
            },
            {
                id: 3,
                name: "send-arc0200-asset-action",
                title: "Send $VIA to a Friend",
                description: "Send $VIA, a Smart Contract Asset, to another address using Kibisis",
                status: null,
                reward: 1,
                guide: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCHmctzaUF",
                frequency: "Daily",
            },
        ]
    },
    {
        id: 3,
        title: "Nautilus",
        type: "NFT Marketplace",
        category: "NFTs",
        column: "nautilus",
        description: "Nautilus is an NFT marketplace on Voi. Complete tasks to earn Voi Points.",
        url: "https://nautilus.sh",
        guide: "https://confused-timbale-d13.notion.site/Nautilus-Voiage-to-MainNet-Quests-0147e70e5fc24467ac0bdab6761c08e3",
        twitter: "https://x.com/NautilusNFTs",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCcBPtzd7E",
        status: "active",
        realtime: true,
        logo: '/logos/nautilus.png',
        quests: [
            {
                id: 1,
                name: "connect_wallet",
                title: "Wallet Quest: Connect Wallet (Account Connection)",
                description: "Wallet Quest: Connect Wallet (Account Connection)",
                status: null,
                reward: 1,
                guide: 'https://confused-timbale-d13.notion.site/Wallet-Quest-Connect-Wallet-Account-Connection-31f5538d31da4969938a832693dcaf2d',
            },
            {
                id: 2,
                name: "sale_list_once",
                title: "Sale Quest: List NFT for Sale",
                description: "Sale Quest: List NFT for Sale",
                status: null,
                reward: 1,
                guide: "https://confused-timbale-d13.notion.site/Sale-Quest-List-NFT-for-Sale-c56a1df7859341b9ae4de3c0a09af95a",
            },
            {
                id: 3,
                name: "sale_buy_once",
                title: "Sale Quest: Buy NFT for Sale",
                description: "Sale Quest: Buy NFT for Sale",
                status: null,
                reward: 1,
                guide: "https://confused-timbale-d13.notion.site/Sale-Quest-Buy-NFT-for-Sale-f65e3255da1d49cb9f0f0f7224f7ec68",
            },
            {
                id: 4,
                name: "timed_sale_list_1minute",
                title: "Timed Quest: List NFT 1 minute after mint on High Forge",
                description: "Timed Quest: List NFT 1 minute after mint on High Forge",
                status: null,
                reward: 1,
            },
            {
                id: 5,
                name: "timed_sale_list_15minutes",
                title: "Timed Quest: List NFT 15 minutes after listing on High Forge",
                description: "Timed Quest: List NFT 15 minutes after listing on High Forge",
                status: null,
                reward: 1,
            },
            {
                id: 6,
                name: "timed_sale_list_1hour",
                title: "Timed Quest: List NFT 1 hour after mint on High Forge",
                description: "Timed Quest: List NFT 1 hour after mint on High Forge",
                status: null,
                reward: 1,
            },
            {
                id: 7,
                name: "faucet_drip_once",
                title: "Faucet Quest: Drip Faucet",
                description: "Collect 1000 VIA from the Nautilus Faucet",
                status: null,
                reward: 1,
                guide: "https://confused-timbale-d13.notion.site/Faucet-Quest-Faucet-Quest-Drip-1000-VIA-from-faucet-9f479e6a507a49b48f0d25487e3f3540",
            },
            {
                id: 8,
                title: "Social Quest: Connect with Nautilus Socials",
                description: "Connect with Nautilus Socials",
                status: null,
                reward: 1,
                guide: "https://confused-timbale-d13.notion.site/Social-Quest-Connect-with-Nautilus-Socials-e6b4c1b76e8c40dfba3969e7e5c3c6da",
            },
            /*{
                id: 9,
                title: "Common Quest: Trade NFTs with more than 5 different wallets",
                description: "Common Quest: Trade NFTs with more than 5 different wallets",
                status: null,
                reward: 1,
            },
            {
                id: 10,
                title: "Common Quest: Collect an NFT from 10 different collections",
                description: "Common Quest: Collect an NFT from 10 different collections",
                status: null,
                reward: 1,
            },
            {
                id: 11,
                title: "Rare Quest: Trade NFTs with more than 10 different wallets",
                description: "Rare Quest: Trade NFTs with more than 10 different wallets",
                status: null,
                reward: 1,
            },
            {
                id: 12,
                title: "Rate Quest: Collect an NFT from 20 different collections",
                description: "Rate Quest: Collect an NFT from 20 different collections",
                status: null,
                reward: 1,
            },
            {
                id: 13,
                title: "Epic Quest: Trade NFTs with more than 25 different wallets",
                description: "Epic Quest: Trade NFTs with more than 25 different wallets",
                status: null,
                reward: 1,
            },
            {
                id: 14,
                title: "Epic Quest: Collect an NFT from 30 different collections",
                description: "Epic Quest: Collect an NFT from 30 different collections",
                status: null,
                reward: 1,
            },
            {
                id: 15,
                title: "Legendary Quest: Trade NFTs with more than 100 different wallets",
                description: "Legendary Quest: Trade NFTs with more than 100 different wallets",
                status: null,
                reward: 1,
            },
            {
                id: 16,
                title: "Legendary Quest: Collect an NFT from each collection",
                description: "Legendary Quest: Collect an NFT from each collection",
                status: null,
                reward: 1,
            }*/
        ],
    },
    {
        id: 5,
        title: "NFT Navigator",
        type: "NFT Discovery",
        category: "NFTs",
        column: "nftnavigator",
        description: "NFTNavigator is a Discovery, Analytics, and Social platform for Voi NFTs. Complete tasks on NFTNavigator to earn Voi Points.",
        url: "https://nftnavigator.xyz",
        guide: "https://wind-bolt-806.notion.site/NFTNavigator-Voiage-to-MainNet-Quests-696da0ba04784f9e827354adc8ec84d1",
        twitter: "https://x.com/voinftnavigator",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GC1sHtz1VC",
        status: 'active',
        realtime: true,
        logo: '/logos/nftnavigator.png',
        quests: [
            {
                id: 1,
                title: "Connect a Wallet",
                name: 'connect_wallet',
                description: 'Connect your Wallet to NFT Navigator',
                guide: 'https://wind-bolt-806.notion.site/Quest-1-Connect-your-Wallet-to-NFTNavigator-dbe44f75bf1948d6a947920af97570df',
                status: null,
                reward: 1,
            },
            {
                id: 2,
                title: "Authenticate your Wallet",
                name: 'auth_wallet',
                description: 'Authenticate your Wallet',
                guide: 'https://wind-bolt-806.notion.site/Quest-2-Authenticate-your-Wallet-bd8a312141e0403688953625e14106df',
                status: null,
                reward: 1,
            },
            {
                id: 3,
                title: "Set an Approved Spender",
                name: 'token_approve',
                description: 'Set an approved spender for a token in your wallet',
                guide: 'https://wind-bolt-806.notion.site/Quest-3-Set-an-approved-spender-for-a-token-in-your-wallet-8beac53d87ab4492a5009cc5db8d69b5?pvs=25',
                status: null,
                reward: 1,
            },
            {
                id: 4,
                title: "Transfer a Token",
                name: 'token_transfer',
                description: 'Transfer a Token to someone else',
                guide: 'https://wind-bolt-806.notion.site/Quest-4-Transfer-a-token-to-someone-else-23a00accea9b4dd299d43a52c6dadf76?pvs=25',
                status: null,
                reward: 1,
            },
            {
                id: 5,
                title: "Create a Public Post in the NFT Lounge",
                name: 'post_public',
                description: 'Create a Public post in the NFT Lounge',
                guide: 'https://wind-bolt-806.notion.site/Quest-5-Create-a-Public-post-in-the-NFT-Lounge-d242603d980e47bda36866d723fdfcad?pvs=25',
                status: null,
                reward: 1,
            },
            {
                id: 6,
                title: "Create a Private Post in the NFT Lounge",
                name: 'post_private',
                description: 'Create a Private post in the NFT Lounge',
                guide: 'https://wind-bolt-806.notion.site/Quest-6-Create-a-Private-post-in-the-NFT-Lounge-e6254158fb994c189a19308f74478f80?pvs=25',
                status: null,
                reward: 1,
            },
            {
                id: 7,
                title: "Vote in a Poll in the NFT Lounge",
                name: 'post_poll_vote',
                description: 'Vote in a Poll in the NFT Lounge',
                guide: 'https://wind-bolt-806.notion.site/Quest-7-Vote-in-a-Poll-in-the-NFT-Lounge-355b4f18a068470fb4f4c4cc3d981a2d',
                status: null,
                reward: 1,
            },
            {
                id: 8,
                title: "React to a Post in the NFT Lounge",
                name: "post_reaction",
                description: "React to a Post in the NFT Lounge",
                guide: "https://wind-bolt-806.notion.site/Quest-8-React-to-a-Post-in-the-NFT-Lounge-5b1d0f7f7e1f4f2c9e0e3f8c6b1f9b3e",
            }
        ],
    },
    {
        id: 4,
        title: "Nomadex",
        type: "DEX",
        category: "DEXes",
        column: "nomadex",
        description: "Nomadex is a decentralized exchange on Voi. Complete tasks on Nomadex to earn Voi Points.",
        url: "https://voi.nomadex.app/swap/VOI-VIA/",
        guide: "https://actions-docs.nomadex.app/",
        twitter: "https://x.com/nomadex_app",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCQebtzCd3",
        status: 'active',
        realtime: true,
        logo: '/logos/NomadexLogoFull.webp',
        quests: [   
            {
                id: 1,
                name: 'connect-wallet',
                title: "Connect Wallet",
                description: "Connect your Voi wallet to Nomadex",
                status: null,
                reward: 1,
                guide: "https://actions-docs.nomadex.app/",
            },
            {
                id: 2,
                name: 'swap',
                title: "Swap",
                description: "Swap tokens on Nomadex",
                status: null,
                reward: 1,
                frequency: "Daily",
                guide: "https://actions-docs.nomadex.app/",
            },
            {
                id: 3,
                name: 'add-liquidity',
                title: "Add Liquidity",
                description: "Add liquidity to a pool on Nomadex",
                status: null,
                reward: 1,
                guide: "https://actions-docs.nomadex.app/",
            },
            {
                id: 4,
                name: 'remove-liquidity',
                title: "Remove Liquidity",
                description: "Remove liquidity from a pool on Nomadex",
                status: null,
                reward: 1,
                guide: "https://actions-docs.nomadex.app/",
            },
            {
                id: 5,
                name: 'create-arc200-token',
                title: "Create ARC200 Token",
                description: "Create an ARC200 token on Nomadex",
                status: null,
                reward: 1,
                guide: "https://actions-docs.nomadex.app/",
            },
            {
                id: 6,
                name: 'create-arc200-pool',
                title: "Create ARC200 Pool",
                description: "Create an ARC200 pool on Nomadex",
                status: null,
                reward: 1,
                guide: "https://actions-docs.nomadex.app/",
            },
            {
                id: 7,
                name: 'create-limit-order',
                title: "Create Limit Order",
                description: "Create a limit order on Nomadex",
                status: null,
                reward: 1,
                guide: "https://actions-docs.nomadex.app/",
            }
        ]
    },
    {
        id: 6,
        title: "Humble",
        type: "DEX",
        category: "DEXes",
        column: "humble",
        description: "Humble is a decentralized exchange platform. Complete tasks on Humble to earn points.",
        url: "https://voi.humble.sh/",
        guide: "https://sandy-griffin-b91.notion.site/Humble-Voi-Testnet-to-Mainnet-Quests-5e2b7a38af1143a88380ff002d7d0eac",
        twitter: "https://x.com/HumbleDefi",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCezbtz9PD",
        status: "active",
        realtime: true,
        logo: '/logos/humble.svg',
        quests: [
            {
                id: 1,
                name: 'connect_wallet',
                title: "Connect your wallet to Humble",
                description: "Connect your wallet to Humble",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-1-Connect-your-wallet-to-Humble-7b60b5bf60df4a64baba0564369365fd",
            },
            {
                id: 2,
                name: "hmbl_pool_swap",
                title: "Make your first Swap",
                description: "Make your first Swap",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-2-Make-your-first-Swap-b1d2c71e200c4a77a56f46d04a4aeaee",
            },
            {
                id: 3,
                name: "hmbl_pool_add",
                title: "Add Liquidity",
                description: "Add Liquidity",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-3-Add-liquidity-f0db2253c4914b9f99905a4d43a058bb",
            },
            {
                id: 4,
                name: "hmbl_token_create",
                title: "Create a Token",
                description: "Create a Token",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-4-Create-a-Token-8ee2077796fb48f68c08b742e8beaca9",
            },
            {
                id: 5,
                name: "hmbl_pool_create",
                title: "Create a Pool",
                description: "Create a Liquidity Pool on Humble Swap",
                status: null,
                reward: 1,            },
            {
                id: 6,
                title: "Stake in a Farm",
                name: "hmbl_farm_stake",
                description: "Stake tokens in a Humble Farm",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-6-Joining-a-Farm-claiming-rewards-5bde5cdf15c0477fbde40c3e3ce57151",
            },
            {
                id: 7,
                name: "hmbl_farm_claim",
                title: "Claim farm rewards",
                description: "Claim rewards from a Humble Farm",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-6-Joining-a-Farm-claiming-rewards-5bde5cdf15c0477fbde40c3e3ce57151",
            },
            {
                id: 8,
                name: "hmbl_farm_create",
                title: "Create a Farm",
                description: "Create a Farm",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-5-Create-a-Farm-f9eb01f0450340ab9ac9904c1ed0239f",
            },
            {
                id: 9,
                name: "hmbl_pool_swap_daily",
                title: "Make a Daily Swap",
                description: "Make a Daily Swap",
                frequency: "Daily",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-2-Make-your-first-Swap-b1d2c71e200c4a77a56f46d04a4aeaee",
            },
            {
                id: 10,
                title: "Connect with Humble Socials",
                description: "Connect with Humble Socials",
                status: null,
                reward: 1,
                guide: "https://sandy-griffin-b91.notion.site/Quest-7-Connect-with-Humble-Socials-2305177c175c463bad8d61dfbfed480c",
            },
        ],
    },
    {
        id: 7,
        title: "Treehouse",
        type: "Tools",
        category: "Tools",
        description: "Treehouse Toolbox provides a set of tools for performing various tasks on the Voi Network. Complete tasks on Treehouse to earn points.",
        url: "https://treehouse-tools.boeieruurd.com/",
        guide: "https://medium.com/@RachKoch/voiage-to-main-net-phase-2-1f8199c1de0e",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCE4atz4He",
        status: "active",
        quests: [
            {
                id: 1,
                title: "Connect Wallet",
                description: "Connect your wallet to Treehouse",
                status: null,
                reward: 1,
            },
            {
                id: 2,
                title: "Take a Snapshot",
                description: "Take a snapshot of an NFT contract",
                status: null,
                reward: 1,
            }
        ],
    },
    {
        id: 8,
        title: "High Forge",
        type: "NFT Minting",
        category: "NFTs",
        description: "High Forge is an NFT minting platform. Mint your first NFT on High Forge, earn points, and use it complete more quests.",
        url: "https://highforge.io/",
        guide: "https://tiny-sodium-7ff.notion.site/High-Forge-Phase-2-Quests-7325ead6581747bca1d1333a9416ab4d",
        twitter: "https://x.com/highforgeio",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCAZPtzxsy",
        status: 'active',
        logo: '/logos/highforge.png',
        quests: [
            {
                id: 1,
                title: 'Mint the Quest 1 NFT',
                description: 'Mint one Quest 1 NFT per day',
                frequency: 'Daily',
                status: null,
                guide: 'https://tiny-sodium-7ff.notion.site/High-Forge-Phase-2-Quests-7325ead6581747bca1d1333a9416ab4d',
                reward: 1,
            },
            {
                id: 2,
                title: 'Mint and List',
                description: 'Get ready for the next challenge! Mint NFTs and list them on one of the available marketplaces.',
                frequency: 'Once',
                status: null,
                guide: 'https://tiny-sodium-7ff.notion.site/High-Forge-Phase-2-Quests-7325ead6581747bca1d1333a9416ab4d',
                reward: 1,
            },
            {
                id: 3,
                title: 'Quest 3: Mint w/ Arc200',
                description: 'The excitement continues! Acquire a specific Arc200 coin from other DeFi platforms, or other users, then mint your NFT to complete the quest. Stay tuned for the link and step-by-step instructions!',
                frequency: 'Once',
                status: null,
                guide: 'https://tiny-sodium-7ff.notion.site/High-Forge-Phase-2-Quests-7325ead6581747bca1d1333a9416ab4d',
                reward: 1,
            },
        ],
    },
    {
        id: 9,
        title: "Arcpay",
        type: "Payments",
        category: "Other",
        description: "Arcpay is a payment gateway. Complete tasks on Arcpay to earn points.",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCLkPtzkAF",
        status: 'active',
        quests: [
            {
                id: 1,
                title: "Follow @WilderStubbs on Twitter",
                description: "Follow @WilderStubbs on Twitter",
                status: null,
                reward: 1,
                guide: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCLkPtzkAF",
            },
        ],
    },
    {
        id: 10,
        title: "A-Wallet",
        type: "Wallet",
        category: "Wallets",
        description: "A-Wallet is a wallet for the Voi Network. Complete tasks on A-Wallet to earn points.",
        url: "https://www.a-wallet.net/",
        guide: "https://rightful-wool-283.notion.site/AWallet-VOI-tasks-f4eb24d261f94072b89bdebbd04507d5",
        twitter: "https://x.com/EAlgonaut",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GCdratzuWv",
        status: "active",
        quests: [
            {
                id: 1,
                title: "Create and use a Multi-Sig Wallet",
                description: "Create and use a Multi-Sig Wallet",
                status: null,
                reward: 1,
                guide: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GC44atzFGT",
            }
        ],
    },
    {
        id: 11,
        title: "Womp Crew",
        type: "Gaming",
        category: "Other",
        description: "Engage with the Womp Crew Poker Party and Spread the word",
        galxe: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GC1Vntz2sh",
        status: "active",
        quests: [
            {
                id: 1,
                title: "Social Media",
                description: "Like and share the Womp Crew Poker Party",
                status: null,
                reward: 1,
                guide: "https://app.galxe.com/quest/87cpJsQTTj3A9XnXam47tQ/GC1Vntz2sh",
            },
        ],
    },
    {
        id: 12,
        title: "Aramid",
        type: "Bridge",
        category: "Other",
        description: "Aramid Finance Token Bridge",
        url: "https://www.aramid.finance/",
        guide: "https://rightful-wool-283.notion.site/Aramid-Finance-VOI-Tasks-4ddb5d02ec304936a111fba47d27f155",
        twitter: "https://x.com/AramidFinance",
        status: "active",
        quests: [
            {
                id: 1,
                title: "Discord",
                description: "Join Aramid Discord",
                status: null,
                reward: 1,
            },
            {
                id: 2,
                title: "X / Twitter",
                description: "Follow Aramid on X",
                status: null,
                reward: 1,
            },
            {
                id: 3,
                title: "Transfer Assets",
                description: "Transfer asset between chains using Aramid Bridge",
                status: null,
                reward: 1,
            },
        ]
    },
    {
        id: 13,
        title: "Biatec Scheduler",
        type: "Tools",
        category: "Tools",
        description: "Biatec Scheduler is a decentralized scheduling platform. Complete tasks on Biatec Scheduler to earn points.",
        url: "https://www.biatec.io/",
        guide: "https://rightful-wool-283.notion.site/Biatec-Scheduler-VOI-Tasks-36685c4e1061455297429e38b9a84ebb",
        twitter: "https://x.com/EAlgonaut",
        status: "active",
        quests: [
            {
                id: 1,
                title: "Join Discord",
                description: "Join Biatec Scheduler Discord",
                status: null,
                reward: 1,
                guide: "https://rightful-wool-283.notion.site/Task-1-Join-discrod-664e44f849884c23b1f7f9d04aa4c226",
            },
            {
                id: 2,
                title: "Follow X Account",
                description: "Follow Biatec Scheduler on X",
                status: null,
                reward: 1,
                guide: "https://rightful-wool-283.notion.site/Task-2-Follow-X-account-ace0b5a833f840d8ae78849a7fc08555",
            },
            {
                id: 3,
                title: "Do a daily scheduled payment",
                description: "Create a scheduled payment on Biatec Scheduler",
                status: null,
                reward: 1,
                guide: "https://rightful-wool-283.notion.site/Task-3-Do-a-daily-scheduled-payment-e62c091cd4a34d8f9523046ecb6514a5",
            },
            {
                id: 4,
                title: "Become executor",
                description: "Become an executor on Biatec Scheduler",
                status: null,
                reward: 1,
                guide: "https://rightful-wool-283.notion.site/Task-4-Become-executor-0ca7c84247f94187b366e1d00366cbaa",
            }
        ],        
    },
    {
        id: 14,
        title: "AlgoLeagues",
        type: "AlgoLeagues Discord Bot",
        category: "Other",
        description: "AlgoLeagues Discord Bot facilitates transferring, withdrawing, and tipping Voi assets in Discord servers. Use the bot in the Voi Discord to earn points.",
        guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/944ddd5dc496d47d7163a3399e4d64ebff32f003/README.md",
        twitter: "https://x.com/algoleagues",
        status: "active",
        realtime: true,
        "quests": [
            {
                id: 1,
                name: 'algo-leagues-1',
                title: "Register a VOI address in Discord",
                description: "Get started with Algo Leagues Discord Bot by registering your VOI address to the Algoleagues bot in the Voi Discord.",
                guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/main/README.md#quest-1-register-a-voi-address-in-discord",
                status: null,
                reward: 1,
            },
            {
                id: 2,
                name: 'algo-leagues-2',
                title: "Confirm your address for Algo Leagues",
                description: "Send a message to the Algo Leagues Discord Bot to confirm your Voi address.",
                guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/main/README.md#quest-2-confirm-your-address-for-algo-leagues",
                status: null,
                reward: 1,
            },
            {
                id: 3,
                name: 'algo-leagues-3',
                title: "Deposit VOI or a Standard Asset to your Algo Leagues account",
                description: "Learn how Voi Standard Assets are deposited for spending in Algo Leagues.",
                guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/main/README.md#quest-3-deposit-voi-or-a-standard-asset-to-your-algo-leagues-account",
                status: null,
                reward: 1,
            },
            {
                id: 4,
                name: 'algo-leagues-4',
                title: "Withdraw VOI or a Standard Asset from your Algo Leagues account",
                description: "Use the Withdraw System to take your Voi assets back to your wallet.",
                guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/main/README.md#quest-4-withdraw-voi-or-a-standard-asset-from-your-algo-leagues-account",
                status: null,
                reward: 1,
            },
            {
                id: 5,
                name: 'algo-leagues-5',
                title: "Approve Algo Leagues to spend a Smart Asset on your behalf",
                description: "Use ARC-200 approvals to maintain custody of your Voi smart assets, while allowing Algo Leagues to spend them.",
                guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/main/README.md#quest-5-approve-algo-leagues-to-spend-a-smart-asset-on-your-behalf",
                status: null,
                reward: 1,
            },
            {
                id: 6,
                name: 'algo-leagues-6',
                title: "Send a Smart Asset to another Discord user",
                description: "Spend an approved balance directly on chain to a single user within Discord",
                guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/main/README.md#quest-6-send-a-smart-asset-to-another-discord-user",
                status: null,
                frequency: 'Weekly',
                reward: 1,
            },
            {
                id: 7,
                name: 'algo-leagues-7',
                title: "Rain a Smart Asset to active users in a Discord channel",
                description: "Spend an approved balance directly on chain to multiple users within Discord",
                guide: "https://github.com/EasyTiger909/algo-leagues-quest-guide/blob/main/README.md#quest-7-rain-a-smart-asset-to-active-users-in-a-discord-channel",
                status: null,
                frequency: 'Weekly',
                reward: 1,
            },
        ]
    },
    {
        id: 15,
        title: "MechaSwap",
        type: "NFT Swap Tool",
        category: "NFTs",
        column: "mechaswap",
        description: "MechaSwap is a trustless NFT swap platform. Complete tasks on MechaSwap to earn points.",
        url: "https://mechaswap.nautilus.sh",
        status: "active",
        logo: '/logos/mecha-swap.webp',
        realtime: true,
        quests: [
            {
                id: 1,
                name: "connect_wallet",
                title: "Connect Wallet to MechaSwap",
                description: "Connect Wallet to MechaSwap",
                status: null,
                reward: 1,
            },
            {
                id: 2,
                name: "swap_list_once",
                title: "List token on MechaSwap (NFT Swap)",
                description: "List token on MechaSwap (NFT Swap)",
                status: null,
                reward: 1,
            },
            {
                id: 3,
                name: "swap_execute_once",
                title: "Execute MechaSwap token swap (NFT Swap)",
                description: "Execute MechaSwap token swap (NFT Swap)",
                status: null,
                reward: 1,
            },
        ]
    },
    {
        id: 16,
        title: "Chubs",
        type: "Chubs v2 NFT Collection",
        category: "NFTs",
        description: "Chubs v2 is a collection of NFTs on Voi. Use your Chub to complete tasks and earn points.",
        url: "https://nftnavigator.xyz/collection/48716545",
        status: "active",
        realtime: true,
        logo: '/logos/chubs.png',
        reward: 1,
        quests: [
            {
                id: 1,
                name: "grab_chub",
                title: "Grab a Chub",
                description: "Grab a Chub from the Chubs v2 collection by minting, buying, or receiving one",
                status: null,
                reward: 1,
            },
            {
                id: 2,
                name: "share_chub",
                title: "Share your Chub",
                description: "Send a Chub v2 to a friend",
                status: null,
                reward: 1,
                frequency: 'Weekly',
            },
            {
                id: 3,
                name: "hold_chub",
                title: "Hold your Chub",
                description: "Hold onto a Chub v2 and keep it in your wallet",
                status: null,
                reward: 1,
                frequency: 'Weekly',
            },
        ]
    }
];
export default projects;
