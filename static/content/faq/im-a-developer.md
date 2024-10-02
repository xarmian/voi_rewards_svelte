---
question: I'm a developer. How can I build on Voi Network?
category: Development
sort: 30
---
Voi Network is an AVM (Algorand Virtual Machine) based blockchain, and as such it supports all Algorand developer tools and documentation. This includes the Algorand SDKs such as the [Python SDK](https://github.com/algorand/py-algorand-sdk) and [Javascript SDK](https://github.com/algorand/js-algorand-sdk).

To make development easier, public endpoints are available for the Voi Indexer and Algod API, which are used to read data from and interact with the network. For larger projects, we recommend using your own Algod and/or Indexer instances or subscribing to (https://nodely.io)[https://nodely.io].

The public endpoints are available at:

- **Voi Node API Base URL**: https://mainnet-api.voi.nodely.dev
- **Voi Indexer API Base URL**: https://mainnet-idx.voi.nodely.dev

Additionally, Voi has embraced the ARC-72 Smart NFT standard, and a public indexer endpoint is available for correlating and reading Smart NFT token and collection data. Documentation for the ARC-72 indexer can be found at [https://arc72-voi-mainnet.nftnavigator.xyz/api-docs](https://arc72-voi-mainnet.nftnavigator.xyz/api-docs). Smart NFTs contain an underlying smart contract that is capable of enabling additional functionality and features.

For more information about building on Voi Network, please refer to the [Voi Developer Documentation](https://docs.voi.network/developers/start-here/).
