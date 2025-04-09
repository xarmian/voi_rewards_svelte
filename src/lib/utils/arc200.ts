import algosdk from 'algosdk';
import { algodClient, algodIndexer } from './algod';
import { arc200 as Arc200Contract } from 'ulujs';
import type { TokenApproval } from '$lib/types/assets';
/**
 * Executes an ARC-200 transferFrom transaction
 * @param appId Application ID of the token contract
 * @param from Address to transfer from (owner of the tokens)
 * @param to Address to transfer to (recipient)
 * @param amount Amount to transfer in base units
 * @param sender Address of the spender executing the transfer
 * @param signer Function to sign the transactions
 * @returns Transaction result with txId and success status
 */
export async function arc200TransferFrom(
    appId: number,
    from: string,
    to: string,
    amount: string | number | bigint,
    sender: string,
    signer: (txns: algosdk.Transaction[]) => Promise<Uint8Array[]>
): Promise<{ success: boolean; txId: string; error?: string }> {
    try {
        // Create Contract instance with algod and indexer
        const contract = new Arc200Contract(appId, algodClient, algodIndexer, {
            acc: {
                addr: sender,
                sk: new Uint8Array()
            }
        });
        
        // Create the transaction for transferFrom
        const txn = await contract.arc200_transferFrom(
            from,
            to,
            BigInt(amount.toString()),
            true,
            false
        );

        if (!txn.success) {
            throw new Error('Failed to create transaction');
        }

        // decode the transactions
        const decodedTxns: algosdk.Transaction[] = txn.txns.map(txn => algosdk.decodeUnsignedTransaction(Buffer.from(txn, 'base64')));

        // Sign transaction
        const signedTxnBytes = await signer(decodedTxns);
        if (!signedTxnBytes || signedTxnBytes.length === 0) {
            throw new Error('Failed to sign transaction');
        }

        // Send transaction
        const response = await algodClient.sendRawTransaction(signedTxnBytes).do();
        
        // Wait for confirmation
        await algosdk.waitForConfirmation(algodClient, response.txId, 4);
        
        return {
            success: true,
            txId: response.txId
        };
    } catch (error) {
        console.error('Error in arc200TransferFrom:', error);
        const errorMessage = error instanceof Error ? error.message : 'Transaction failed';
        return {
            success: false,
            txId: '',
            error: errorMessage
        };
    }
}

/**
 * Creates an ARC-200 approval allowing a spender to transfer tokens on behalf of the owner
 * @param appId Application ID of the token contract
 * @param spender Address that will be allowed to spend tokens
 * @param amount Amount to approve in base units
 * @param sender Address of the owner creating the approval
 * @param signer Function to sign the transactions
 * @returns Transaction result with txId and success status
 */
export async function arc200Approve(
    appId: number,
    spender: string,
    amount: string | number | bigint,
    sender: string,
    signer: (txns: algosdk.Transaction[]) => Promise<Uint8Array[]>
): Promise<{ success: boolean; txId: string; error?: string }> {
    try {
        // Create Contract instance with algod and indexer
        const contract = new Arc200Contract(appId, algodClient, algodIndexer, {
            acc: {
                addr: sender,
                sk: new Uint8Array()
            }
        });
        
        // Create the transaction for approve
        const txn = await contract.arc200_approve(
            spender,
            BigInt(amount.toString()),
            true,
            false
        );

        if (!txn.success) {
            throw new Error('Failed to create approval transaction');
        }

        // decode the transactions
        const decodedTxns: algosdk.Transaction[] = txn.txns.map(txn => algosdk.decodeUnsignedTransaction(Buffer.from(txn, 'base64')));

        // Sign transaction
        const signedTxnBytes = await signer(decodedTxns);
        if (!signedTxnBytes || signedTxnBytes.length === 0) {
            throw new Error('Failed to sign transaction');
        }

        // Send transaction
        const response = await algodClient.sendRawTransaction(signedTxnBytes).do();
        
        // Wait for confirmation
        await algosdk.waitForConfirmation(algodClient, response.txId, 4);
        
        return {
            success: true,
            txId: response.txId
        };
    } catch (error) {
        console.error('Error in arc200Approve:', error);
        const errorMessage = error instanceof Error ? error.message : 'Approval transaction failed';
        return {
            success: false,
            txId: '',
            error: errorMessage
        };
    }
}

/**
 * Revokes an ARC-200 approval by setting it to zero
 * @param appId Application ID of the token contract
 * @param spender Address that will no longer be allowed to spend tokens
 * @param sender Address of the owner revoking the approval
 * @param signer Function to sign the transactions
 * @returns Transaction result with txId and success status
 */
export async function arc200RevokeApproval(
    appId: number,
    spender: string,
    sender: string,
    signer: (txns: algosdk.Transaction[]) => Promise<Uint8Array[]>
): Promise<{ success: boolean; txId: string; error?: string }> {
    // Revoking approval is done by setting the approval amount to 0
    return arc200Approve(appId, spender, 0, sender, signer);
}

/**
 * Fetches active approvals for tokens owned by the specified address
 * @param walletAddress The wallet address to check for approvals
 * @returns List of active approvals where the specified address is the owner
 */
export async function fetchOutgoingApprovals(walletAddress: string): Promise<{ contractId: number; tokenName: string; symbol: string; spender: string; amount: string; timestamp: number; transactionId: string }[]> {
    try {
        const url = new URL('https://voi-mainnet-mimirapi.voirewards.com/arc200/approvals');
        url.searchParams.append('owner', walletAddress);
        
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error('Failed to fetch outgoing approvals');
        }
        
        const data = await response.json();
        return (data.approvals || []).map((approval: TokenApproval) => ({
            contractId: approval.contractId,
            owner: approval.owner,
            spender: approval.spender,
            amount: approval.amount,
            timestamp: approval.timestamp,
            round: approval.round,
            transactionId: approval.transactionId
        })).filter((approval: TokenApproval) => approval.amount !== '0');
    } catch (error) {
        console.error('Error fetching outgoing approvals:', error);
        return [];
    }
} 