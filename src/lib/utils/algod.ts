import algosdk from 'algosdk';

// Algorand node settings
const server = 'https://testnet-api.voi.nodly.io';
const port = '443';
const token = '';

// Initialize the Algodv2 client
export const algodClient = new algosdk.Algodv2(token, server, port);
