import algosdk from 'algosdk';

// Algorand node settings
// const server = 'https://testnet-api.voi.nodly.io';
const server = 'https://mainnet-api.voi.nodely.dev';
const port = '443';
const token = '';

// Algorand indexer settings
// const indexerServer = 'https://testnet-idx.voi.nodly.io';
const indexerServer = 'https://mainnet-idx.voi.nodely.dev';
const indexerPort = '443';
const indexerToken = '';

// Initialize the Algodv2 client
export const algodClient = new algosdk.Algodv2(token, server, port);
export const algodIndexer = new algosdk.Indexer(indexerToken, indexerServer, indexerPort);