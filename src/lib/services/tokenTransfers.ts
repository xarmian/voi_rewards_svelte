import { calculateUserPoolShare, isLPToken } from '$lib/tokens/lpStats';
/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the moved upstream payload handling. */
import type { FungibleTokenType, LPToken } from '$lib/types/assets';
import { algodIndexer } from '$lib/utils/algod';
import { getEnvoiNames } from '$lib/utils/envoi';
import {
	decodeBase64Log,
	identifyEventType,
	isDepositOrWithdrawEvent,
	decodeDepositEvent,
	decodeWithdrawEvent,
	decodeAltDepositEvent,
	decodeAltWithdrawEvent
} from '$lib/chain/arc200Events';

export interface Transfer {
	contractid?: string;
	from: string;
	to: string;
	amount: string;
	round: number;
	transactionid: string;
	timestamp: number;
	from_name?: string;
	to_name?: string;
	note?: string;
	type?: 'payment' | 'fee' | 'inner-payment';
	parentTxId?: string;
	fee?: number;
	isLpExchange?: boolean;
	lpExchangeType?: 'add' | 'remove';
	exchangedTokens?: {
		tokenA?: {
			id: string;
			symbol: string;
			amount: string;
		};
		tokenB?: {
			id: string;
			symbol: string;
			amount: string;
		};
	};
	groupId?: string;
}

interface FetchTokenTransfersOptions {
	token: FungibleTokenType | LPToken;
	walletId: string;
	nextToken?: string;
	hasMore?: boolean;
	append?: boolean;
	limit?: number;
	offset?: number;
	transfers?: Transfer[];
	// Preserve pagination changes even when a later upstream request fails.
	onPagination?: (pagination: { nextToken: string | undefined; hasMore: boolean }) => void;
}

export async function fetchTokenTransfers({
	token,
	walletId,
	nextToken,
	hasMore = true,
	append = false,
	limit = 50,
	offset = 0,
	transfers = [],
	onPagination
}: FetchTokenTransfersOptions) {
	let newTransfers: Transfer[] = [];

	async function fetchNativeTransfers() {
		// Continue fetching until we have enough transfers or reach the end
		let continueSearching = true;
		let currentNextToken = append && nextToken ? nextToken : '';
		let attempts = 0;
		const maxAttempts = 5; // Limit the number of attempts to prevent infinite loops

		while (continueSearching && attempts < maxAttempts) {
			attempts++;

			// Fetch all transactions involving this address
			const txns = await algodIndexer
				.searchForTransactions()
				.address(walletId)
				.limit(limit)
				.nextToken(currentNextToken)
				.do();

			// Store the next token for pagination
			currentNextToken = txns['next-token'];

			// Process transactions from this batch
			const batchTransfers: Transfer[] = [];

			txns.transactions.forEach((tx: any) => {
				const transfers: Transfer[] = [];

				// Handle different transaction types that affect VOI balance
				if (tx['tx-type'] === 'pay') {
					// Regular payment transaction
					transfers.push({
						from: tx.sender,
						to: tx['payment-transaction'].receiver,
						amount: (tx['payment-transaction'].amount / Math.pow(10, token.decimals)).toString(),
						round: tx['confirmed-round'],
						transactionid: tx.id,
						timestamp: tx['round-time'],
						note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined,
						type: 'payment',
						fee: tx.fee
					});
				} else if (tx.sender === walletId && tx.fee > 0 && tx['tx-type'] !== 'pay') {
					// Only add standalone fee transfer if this is not a payment transaction
					transfers.push({
						from: tx.sender,
						to: 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY',
						amount: (tx.fee / Math.pow(10, token.decimals)).toString(),
						round: tx['confirmed-round'],
						transactionid: tx.id,
						timestamp: tx['round-time'],
						note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined,
						type: 'fee'
					});
				}

				// Handle inner transactions for all transaction types
				if (tx['inner-txns']) {
					tx['inner-txns'].forEach((innerTx: any) => {
						if (innerTx['tx-type'] === 'pay') {
							transfers.push({
								from: innerTx.sender,
								to: innerTx['payment-transaction'].receiver,
								amount: (
									innerTx['payment-transaction'].amount / Math.pow(10, token.decimals)
								).toString(),
								round: tx['confirmed-round'],
								transactionid: innerTx.id,
								timestamp: tx['round-time'],
								note: innerTx.note ? Buffer.from(innerTx.note, 'base64').toString() : undefined,
								type: 'inner-payment',
								parentTxId: tx.id,
								fee: 0
							});
						}
					});
				}

				batchTransfers.push(...transfers.filter((t) => t.from === walletId || t.to === walletId));
			});

			// Add batch transfers to our result set
			newTransfers.push(...batchTransfers);

			// Determine if we should continue searching
			if (!currentNextToken) {
				// No more data available
				continueSearching = false;
				hasMore = false;
			} else if (newTransfers.length >= limit) {
				// We have enough transfers to display
				continueSearching = false;
				hasMore = true;
				nextToken = currentNextToken;
			}
		}

		// Sort by timestamp descending (most recent first)
		newTransfers.sort((a, b) => b.timestamp - a.timestamp);

		// If we hit max attempts but still have more data
		if (attempts >= maxAttempts && currentNextToken) {
			hasMore = true;
			nextToken = currentNextToken;
		}
	}

	/* eslint-disable @typescript-eslint/no-unused-vars -- Preserve the existing event bookkeeping. */
	async function fetchArc200Transfers() {
		// Check if this is an LP token
		const isLp = isLPToken(token);

		// Fetch ARC200 transfers
		const response = await fetch(
			`/api/mimir?action=get_arc200_transfers&p_contractid=${token.id}&p_user=${walletId}&p_limit=${limit}&p_offset=${offset}`
		);
		const result = await response.json();

		if (result.error) {
			throw new Error(result.error);
		}

		newTransfers = result.data.map((transfer: Transfer) => ({
			...transfer,
			amount: (Number(transfer.amount) / Math.pow(10, token.decimals)).toString()
		}));

		// For LP tokens, fetch additional atomic transaction info
		if (
			isLp &&
			'poolInfo' in token &&
			token.poolInfo &&
			'tokAId' in token.poolInfo &&
			'tokBId' in token.poolInfo &&
			'tokASymbol' in token.poolInfo &&
			'tokBSymbol' in token.poolInfo &&
			'tokADecimals' in token.poolInfo &&
			'tokBDecimals' in token.poolInfo
		) {
			const poolInfo = token.poolInfo as LPToken['poolInfo'];
			// Process each transfer to find potential atomic group transactions
			for (let i = 0; i < newTransfers.length; i++) {
				const transfer = newTransfers[i];
				try {
					// Get the transaction details to check for atomic group
					const txInfo = await algodIndexer.lookupTransactionByID(transfer.transactionid).do();

					// Check if transaction has logs (for Nomadex events)
					if (txInfo.transaction.logs && txInfo.transaction.logs.length > 0) {
						// Process logs to find Deposit or Withdraw events
						let isDeposit = false;
						let isWithdraw = false;
						let tokenAAmount: bigint | null = null;
						let tokenBAmount: bigint | null = null;
						let lpTokenAmount: bigint | null = null;
						let needsTokenSwap = false;
						let isHumbleFormat = false;

						for (const logBase64 of txInfo.transaction.logs) {
							const logBuffer = decodeBase64Log(logBase64);

							// Extract the selector for token swap detection
							const selector = logBuffer.slice(0, 4).toString('hex');

							// Determine if this is Humble's format (needs special handling)
							isHumbleFormat = selector === '192a776c' || selector === '151f7c75';

							// Only swap tokens for specific DEXes, NOT for Humble
							// Humble's format should NOT have tokens swapped
							needsTokenSwap = false;

							// Note: For Humble DEX, the token order is already correct
							// - '192a776c' is the Deposit selector (Add Liquidity)
							// - '151f7c75' is the Withdraw selector (Remove Liquidity)

							// First try to identify the event type directly
							const eventType = identifyEventType(logBuffer);

							// Then check if it's a deposit or withdraw specifically
							const { isDeposit: isDepositEvent, isWithdraw: isWithdrawEvent } =
								isDepositOrWithdrawEvent(logBuffer);

							// For Humble's format, we need to explicitly set the correct event type
							// based on the selector, as the structure-based detection might be unreliable
							if (isHumbleFormat) {
								if (selector === '192a776c') {
									isDeposit = true;
									isWithdraw = false;
								} else if (selector === '151f7c75') {
									isDeposit = false;
									isWithdraw = true;
								}
							} else {
								// For other DEXes, use the standard detection
								if (isDepositEvent && !isWithdrawEvent) {
									isDeposit = true;
									isWithdraw = false;
								} else if (isWithdrawEvent && !isDepositEvent) {
									isDeposit = false;
									isWithdraw = true;
								}
							}

							// Check for Deposit event
							if (isDepositEvent && !isWithdrawEvent) {
								isDeposit = true;
								isWithdraw = false;

								// Try both deposit decoders
								let depositData = null;
								let isAltFormat = false;

								// First try standard format
								try {
									depositData = decodeDepositEvent(logBuffer);
									if (depositData) {
										tokenAAmount = depositData.inAmts[0];
										tokenBAmount = depositData.inAmts[1];
										lpTokenAmount = depositData.outLpt;
									}
								} catch (e) {
									console.log('Failed to decode as standard Deposit:', e);
								}

								// If standard format failed, try alternative format
								if (!depositData) {
									try {
										const altDepositData = decodeAltDepositEvent(logBuffer);
										if (altDepositData) {
											isAltFormat = true;
											tokenAAmount = altDepositData.inAmts[0];
											tokenBAmount = altDepositData.inAmts[1];
											lpTokenAmount = altDepositData.outLpt;
										}
									} catch (e) {
										console.log('Failed to decode as alternative Deposit:', e);
									}
								}
							}
							// Check for Withdraw event
							else if (isWithdrawEvent && !isDepositEvent) {
								isDeposit = false;
								isWithdraw = true;

								// Try both withdraw decoders
								let withdrawData = null;
								let isAltFormat = false;

								// First try standard format
								try {
									withdrawData = decodeWithdrawEvent(logBuffer);
									if (withdrawData) {
										lpTokenAmount = withdrawData.inLpt;
										tokenAAmount = withdrawData.outAmts[0];
										tokenBAmount = withdrawData.outAmts[1];
									}
								} catch (e) {
									console.log('Failed to decode as standard Withdraw:', e);
								}

								// If standard format failed, try alternative format
								if (!withdrawData) {
									try {
										const altWithdrawData = decodeAltWithdrawEvent(logBuffer);
										if (altWithdrawData) {
											isAltFormat = true;
											lpTokenAmount = altWithdrawData.inLpt;
											tokenAAmount = altWithdrawData.outAmts[0];
											tokenBAmount = altWithdrawData.outAmts[1];
										}
									} catch (e) {
										console.log('Failed to decode as alternative Withdraw:', e);
									}
								}
							}
							// If we can't determine the event type from the log, try to infer from the transfer direction
							else if (!isDeposit && !isWithdraw) {
								// For LP tokens:
								// - If user is receiving LP tokens, it's likely an add liquidity operation
								// - If user is sending LP tokens, it's likely a remove liquidity operation
								if (transfer.to === walletId) {
									isDeposit = true;
									isWithdraw = false;
								} else if (transfer.from === walletId) {
									isDeposit = false;
									isWithdraw = true;
								}
							}
						}

						// If we found a Deposit or Withdraw event, update the transfer with LP exchange details
						if ((isDeposit || isWithdraw) && (tokenAAmount !== null || tokenBAmount !== null)) {
							transfer.isLpExchange = true;

							// SIMPLIFIED APPROACH: Use token transfer direction to determine operation type
							// If user is receiving LP tokens, it's Add Liquidity
							// If user is sending LP tokens, it's Remove Liquidity
							if (transfer.to === walletId) {
								transfer.lpExchangeType = 'add';
							} else if (transfer.from === walletId) {
								transfer.lpExchangeType = 'remove';
							} else {
								// Fallback to event-based detection if transfer doesn't involve the user directly
								transfer.lpExchangeType = isDeposit ? 'add' : 'remove';
							}

							// Only swap tokens for specific DEXes, NOT for Humble
							if (needsTokenSwap && tokenAAmount !== null && tokenBAmount !== null) {
								// Swap token A and B
								[tokenAAmount, tokenBAmount] = [tokenBAmount, tokenAAmount];
							}

							// For Humble, ensure the correct operation type based on the selector
							if (isHumbleFormat) {
								// For Humble format, we already set the correct operation type earlier
								// based on the selector, so we don't need to do anything here
							}

							// Convert BigInt to string with proper decimal places
							// Handle potential numeric conversion issues
							let tokenAAmountStr = 'Unknown';
							let tokenBAmountStr = 'Unknown';

							try {
								// For very large numbers, BigInt to Number conversion might lose precision
								// Use a safer approach for display purposes
								if (tokenAAmount !== null) {
									if (tokenAAmount < 9007199254740991n) {
										// Max safe integer in JS
										tokenAAmountStr = (
											Number(tokenAAmount) / Math.pow(10, poolInfo.tokADecimals)
										).toFixed(poolInfo.tokADecimals);
									} else {
										// For very large numbers, format manually
										const divisor = BigInt(10 ** poolInfo.tokADecimals);
										const wholePart = tokenAAmount / divisor;
										const fractionalPart = tokenAAmount % divisor;
										tokenAAmountStr =
											wholePart.toString() +
											'.' +
											fractionalPart.toString().padStart(poolInfo.tokADecimals, '0');
									}
								}

								if (tokenBAmount !== null) {
									if (tokenBAmount < 9007199254740991n) {
										// Max safe integer in JS
										tokenBAmountStr = (
											Number(tokenBAmount) / Math.pow(10, poolInfo.tokBDecimals)
										).toFixed(poolInfo.tokBDecimals);
									} else {
										// For very large numbers, format manually
										const divisor = BigInt(10 ** poolInfo.tokBDecimals);
										const wholePart = tokenBAmount / divisor;
										const fractionalPart = tokenBAmount % divisor;
										tokenBAmountStr =
											wholePart.toString() +
											'.' +
											fractionalPart.toString().padStart(poolInfo.tokBDecimals, '0');
									}
								}
							} catch (e) {
								console.error('Error formatting token amounts:', e);
							}

							transfer.exchangedTokens = {
								tokenA: {
									id: poolInfo.tokAId,
									symbol: poolInfo.tokASymbol,
									amount: tokenAAmountStr
								},
								tokenB: {
									id: poolInfo.tokBId,
									symbol: poolInfo.tokBSymbol,
									amount: tokenBAmountStr
								}
							};
						}
						// If we couldn't extract token amounts but we know it's an LP exchange
						else if (isDeposit || isWithdraw) {
							transfer.isLpExchange = true;

							// SIMPLIFIED APPROACH: Use token transfer direction
							if (transfer.to === walletId) {
								transfer.lpExchangeType = 'add';
							} else if (transfer.from === walletId) {
								transfer.lpExchangeType = 'remove';
							} else {
								// Fallback to event-based detection
								transfer.lpExchangeType = isDeposit ? 'add' : 'remove';
							}

							// Set placeholder token amounts
							transfer.exchangedTokens = {
								tokenA: {
									id: poolInfo.tokAId,
									symbol: poolInfo.tokASymbol,
									amount: 'Unknown'
								},
								tokenB: {
									id: poolInfo.tokBId,
									symbol: poolInfo.tokBSymbol,
									amount: 'Unknown'
								}
							};
						}
						// If we couldn't identify any LP events but it's an LP token transfer
						else if (isLPToken(token)) {
							// For LP tokens, if the user is sending the token, it's a remove liquidity operation
							// If the user is receiving the token, it's an add liquidity operation
							if (transfer.from === walletId) {
								transfer.isLpExchange = true;
								transfer.lpExchangeType = 'remove';
							} else if (transfer.to === walletId) {
								transfer.isLpExchange = true;
								transfer.lpExchangeType = 'add';
							}
						}
					}
				} catch (err) {
					console.error('Error processing LP transaction:', err);
				}
			}
		}

		// For ARC200, use length-based pagination
		hasMore = newTransfers.length === limit;
	}

	/* eslint-enable @typescript-eslint/no-unused-vars */
	async function fetchVsaTransfers() {
		// Fetch VSA transfers
		const assetId = Number(token.id);
		const txns = await algodIndexer
			.searchForTransactions()
			.assetID(assetId)
			.address(walletId)
			.limit(limit)
			.nextToken(append && nextToken ? nextToken : '')
			.do();

		// Store the next token for pagination
		nextToken = txns['next-token'];
		hasMore = !!nextToken;

		newTransfers = txns.transactions
			.filter((tx: any) => tx['tx-type'] === 'axfer')
			.map((tx: any) => ({
				from: tx.sender,
				to: tx['asset-transfer-transaction'].receiver,
				amount: (tx['asset-transfer-transaction'].amount / Math.pow(10, token.decimals)).toString(),
				round: tx['confirmed-round'],
				transactionid: tx.id,
				timestamp: tx['round-time'],
				note: tx.note ? Buffer.from(tx.note, 'base64').toString() : undefined
			}));
	}

	try {
		if (token.type === 'native') {
			await fetchNativeTransfers();
		} else if (token.type === 'arc200') {
			await fetchArc200Transfers();
		} else {
			await fetchVsaTransfers();
		}
		// Don't append empty results.
		if (newTransfers.length === 0) {
			hasMore = false;
			return { transfers: newTransfers, nextToken, hasMore };
		}
		// collect unique addresses
		const uniqueAddresses = [
			...new Set([
				...transfers.map((t: Transfer) => t.from),
				...newTransfers.map((t: Transfer) => t.from),
				...newTransfers.map((t: Transfer) => t.to)
			])
		];
		const envoiNames = await getEnvoiNames(uniqueAddresses);
		newTransfers.forEach((t: Transfer) => {
			if (t.to === 'TBEIGCNK4UCN3YDP2NODK3MJHTUZMYS3TABRM2MVSI2MPUR2V36E5JYHSY') {
				t.to_name = 'Fee Sink';
			} else {
				t.to_name = envoiNames.find((n) => n.address === t.to)?.name || undefined;
			}
			t.from_name = envoiNames.find((n) => n.address === t.from)?.name || undefined;
		});

		return { transfers: newTransfers, nextToken, hasMore };
	} finally {
		onPagination?.({ nextToken, hasMore });
	}
}

export function fetchCurrentPoolBalance(
	token: FungibleTokenType | LPToken,
	currentPoolBalance: { tokenA: number; tokenB: number } | null
) {
	if (!isLPToken(token) || !token.poolInfo || currentPoolBalance) return;
	const poolInfo = token.poolInfo;

	try {
		// Calculate user's share of the pool
		const userShare = calculateUserPoolShare(token);

		if (!(userShare > 0)) return;
		// For Humble pools, we might need to fetch the latest pool data
		if (poolInfo.provider === 'humble' && poolInfo.poolId) {
			return fetchHumbleBalance(userShare);
		}
		return fallbackBalance(userShare);
	} catch (error) {
		console.error('Error fetching current pool balance:', error);
	}
	async function fetchHumbleBalance(userShare: number) {
		try {
			// Fetch the latest pool data from Humble API
			const response = await fetch(
				`https://mainnet-idx.algonode.cloud/v2/accounts/${poolInfo.poolId}`
			);
			const data = await response.json();

			if (data && data.account) {
				// Extract the token balances from the account assets
				const assets = data.account.assets || [];

				// Find the token A and token B assets
				const tokenAAsset = assets.find(
					(asset: any) => asset['asset-id'].toString() === poolInfo.tokAId
				);
				const tokenBAsset = assets.find(
					(asset: any) => asset['asset-id'].toString() === poolInfo.tokBId
				);

				if (tokenAAsset && tokenBAsset) {
					// Calculate the user's share of each token
					// For Humble, the asset amounts are in raw form and need to be divided by 10^decimals
					const tokenAAmount =
						userShare * (Number(tokenAAsset.amount) / Math.pow(10, poolInfo.tokADecimals));
					const tokenBAmount =
						userShare * (Number(tokenBAsset.amount) / Math.pow(10, poolInfo.tokBDecimals));

					// Update the current pool balance
					// For Humble pools, multiply by 10^6 to correct the value
					return {
						tokenA: tokenAAmount * Math.pow(10, 6),
						tokenB: tokenBAmount * Math.pow(10, 6)
					};
				}
			}
		} catch (error) {
			console.error('Error fetching Humble pool data:', error);
		}
		try {
			return fallbackBalance(userShare);
		} catch (error) {
			console.error('Error fetching current pool balance:', error);
		}
	}

	function fallbackBalance(userShare: number) {
		// IMPORTANT: For Humble pools, tokABalance and tokBBalance are already in decimal form
		// For other providers, we need to divide by 10^decimals
		let tokenAAmount, tokenBAmount;

		if (poolInfo.provider === 'humble') {
			// For Humble pools, multiply by 10^6 to correct the value
			tokenAAmount = userShare * Number(poolInfo.tokABalance) * Math.pow(10, 6);
			tokenBAmount = userShare * Number(poolInfo.tokBBalance) * Math.pow(10, 6);
		} else {
			tokenAAmount =
				userShare * (Number(poolInfo.tokABalance) / Math.pow(10, poolInfo.tokADecimals));
			tokenBAmount =
				userShare * (Number(poolInfo.tokBBalance) / Math.pow(10, poolInfo.tokBDecimals));
		}

		// Create currentPoolBalance object
		return {
			tokenA: tokenAAmount,
			tokenB: tokenBAmount
		};
	}
}
