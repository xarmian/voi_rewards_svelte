---
question: What are ARC-200 and ARC-72 tokens on the Voi Network?
category: Development
sort: 31
---
ARC-200 and ARC-72 are the standard token formats adopted by Voi Network. These "Smart Assets" offer enhanced functionality compared to traditional blockchain assets:

1. **ARC-200**: This standard is used for fungible tokens, similar to ERC-20 (Ethereum) or ASAs (Algorand). These tokens can represent various fungible assets like cryptocurrencies or tokenized commodities.

2. **ARC-72**: This standard is used for non-fungible tokens (NFTs), allowing for unique digital assets like digital art or collectibles.

### Key features of ARC-200 and ARC-72 tokens:

- **Programmability**: Unlike "Plain Assets," these Smart Assets can have additional logic and metadata encoded directly into them.
- **Versatility**: They can represent a wide range of assets with complex behaviors. For example, an ARC-200 and/or ARC-72 token could include built-in subscription or royalty systems.
- **Standardization**: These assets use a set of standardized smart contracts, making them easier to create, transfer, and manage within the Voi ecosystem.

The main advantage in using these standards on Voi is the ability to create more sophisticated and flexible digital assets compared to simpler token standards. This opens up possibilities for complex financial instruments, unique digital collectibles, and tokenized real-world assets, all with built-in programmable features.

Complete documentation on these standards can be found on the Algorand Foundation ARC registry:

- [ARC-200](https://arc.algorand.foundation/ARCs/arc-0200)
- [ARC-72](https://arc.algorand.foundation/ARCs/arc-0072)

Voi Network operates a public ARC-72 indexer, which can be used to search for ARC-72 tokens and metadata information such as owners, creators, collections, images, and more. The complete documentation on this indexer can be found here:

- [ARC-72 Indexer API Documentation](https://arc72-voi-mainnet.nftnavigator.xyz/api-docs)

While the use of these standards is not mandatory, they are recommended as a mechanism to ensure interoperability and compatibility within the Voi Network. By conforming to ARC-200 and ARC-72 when creating digital assets, tools and wallets within the Voi ecosystem are able to identify and interact with the assets without additional customization.