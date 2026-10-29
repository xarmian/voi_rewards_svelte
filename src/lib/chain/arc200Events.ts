// Event types for decoding
export const EventType = {
	TRANSFER: 'arc200_Transfer',
	APPROVAL: 'arc200_Approval',
	SWAP: 'Swap',
	DEPOSIT: 'Deposit',
	WITHDRAW: 'Withdraw'
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

// Function to decode base64 logs
export function decodeBase64Log(log: string): Buffer {
	return Buffer.from(log, 'base64');
}

// Function to calculate event selector from event signature
export function calculateEventSelector(eventName: string, argTypes: string[]): string {
	// In Ethereum/AVM, the event selector is the first 4 bytes of the keccak256 hash of the event signature
	// For simplicity, we're using a mapping approach here since we don't have keccak256 readily available

	// Map of known event signatures to their selectors
	// These are the actual selectors for different DEX events based on their ABIs
	const knownSelectors: Record<string, string> = {
		// Nomadex events (uint256 format)
		'arc200_Transfer(address,address,uint256)': '79f88824', // Transfer event
		'arc200_Approval(address,address,uint256)': '8c5be1e5', // Approval event
		'Swap(address,(uint256,uint256),(uint256,uint256),(uint256,uint256))': 'c42079f9', // Swap event
		'Deposit(address,(uint256,uint256),uint256,(uint256,uint256))': '73d468a3', // Deposit event
		'Withdraw(address,uint256,(uint256,uint256),(uint256,uint256))': '9b1bfa7f', // Withdraw event

		// Alternative DEX events (uint64 format)
		'Deposit(address,(uint64,uint64),uint64,(uint64,uint64),(uint64,uint64))': '3d013e7d', // Alt Deposit event
		'Withdraw(address,uint64,(uint64,uint64),(uint64,uint64),(uint64,uint64))': '2c3e5eff', // Alt Withdraw event

		// Additional observed selectors from logs
		Deposit: '192a776c', // Another observed Deposit selector
		Withdraw: '151f7c75' // Another observed Withdraw selector
	};

	// Construct the event signature
	const signature = `${eventName}(${argTypes.join(',')})`;

	// Return the known selector or a fallback
	return knownSelectors[signature] || knownSelectors[eventName] || '';
}

// Function to identify event type from log
export function identifyEventType(log: Buffer): EventTypeValue | null {
	if (log.length < 4) {
		return null;
	}

	// Extract the selector (first 4 bytes)
	const selector = log.slice(0, 4).toString('hex');

	// Hardcoded selectors based on actual DEX implementations
	// These are the actual selectors observed in transaction logs
	const TRANSFER_SELECTOR = '79f88824'; // arc200_Transfer
	const APPROVAL_SELECTOR = '8c5be1e5'; // arc200_Approval
	const SWAP_SELECTOR = 'c42079f9'; // Swap

	// Nomadex format (uint256)
	const DEPOSIT_SELECTOR = '73d468a3';
	const WITHDRAW_SELECTOR = '9b1bfa7f';

	// Alternative DEX format (uint64)
	// These selectors should match the actual values from the alternative DEX
	// Update these values if they don't match what you observe in transaction logs
	const ALT_DEPOSIT_SELECTOR = '3d013e7d';
	const ALT_WITHDRAW_SELECTOR = '2c3e5eff';

	// Additional observed selectors
	const OBSERVED_DEPOSIT_SELECTOR = '192a776c'; // Humble Deposit selector
	const OBSERVED_WITHDRAW_SELECTOR = '151f7c75'; // Humble Withdraw selector

	// Combined selectors for easier checking
	const DEPOSIT_SELECTORS = [DEPOSIT_SELECTOR, ALT_DEPOSIT_SELECTOR, OBSERVED_DEPOSIT_SELECTOR];
	const WITHDRAW_SELECTORS = [WITHDRAW_SELECTOR, ALT_WITHDRAW_SELECTOR, OBSERVED_WITHDRAW_SELECTOR];

	// Direct selector matching
	if (selector === TRANSFER_SELECTOR) {
		return EventType.TRANSFER;
	} else if (selector === APPROVAL_SELECTOR) {
		return EventType.APPROVAL;
	} else if (selector === SWAP_SELECTOR) {
		return EventType.SWAP;
	} else if (DEPOSIT_SELECTORS.includes(selector)) {
		return EventType.DEPOSIT;
	} else if (WITHDRAW_SELECTORS.includes(selector)) {
		return EventType.WITHDRAW;
	}

	// Special handling for Humble selectors to ensure they're properly identified
	if (selector === OBSERVED_DEPOSIT_SELECTOR) {
		return EventType.DEPOSIT;
	} else if (selector === OBSERVED_WITHDRAW_SELECTOR) {
		return EventType.WITHDRAW;
	}

	try {
		// For logs of sufficient length, try to decode as both event types
		if (log.length >= 132) {
			// Minimum length for both event types
			// Try to decode as Deposit
			try {
				const depositData = decodeDepositEvent(log);
				if (depositData && depositData.outLpt > 0n) {
					return EventType.DEPOSIT;
				}
			} catch (e) {
				console.log('Failed to decode as Deposit:', e);
			}

			// Try to decode as Withdraw
			try {
				const withdrawData = decodeWithdrawEvent(log);
				if (withdrawData && withdrawData.inLpt > 0n) {
					return EventType.WITHDRAW;
				}
			} catch (e) {
				console.log('Failed to decode as Withdraw:', e);
			}

			// Try alternative format decoders
			try {
				const altDepositData = decodeAltDepositEvent(log);
				if (altDepositData && altDepositData.outLpt > 0n) {
					return EventType.DEPOSIT;
				}
			} catch (e) {
				console.log('Failed to decode as Alt Deposit:', e);
			}

			try {
				const altWithdrawData = decodeAltWithdrawEvent(log);
				if (altWithdrawData && altWithdrawData.inLpt > 0n) {
					return EventType.WITHDRAW;
				}
			} catch (e) {
				console.log('Failed to decode as Alt Withdraw:', e);
			}
		}
	} catch (e) {
		console.error('Error during event type inference:', e);
	}

	// If we still can't determine, use log length as a heuristic
	if (log.length >= 100 && log.length < 120) {
		return EventType.TRANSFER;
	}

	return null;
}

// Function to determine if a log is a Deposit or Withdraw event
export function isDepositOrWithdrawEvent(log: Buffer): { isDeposit: boolean; isWithdraw: boolean } {
	if (log.length < 4) {
		return { isDeposit: false, isWithdraw: false };
	}

	try {
		// Extract the selector (first 4 bytes)
		const selector = log.slice(0, 4).toString('hex');

		// Hardcoded selectors based on actual DEX implementations
		// Nomadex format (uint256)
		const DEPOSIT_SELECTOR = '73d468a3';
		const WITHDRAW_SELECTOR = '9b1bfa7f';

		// Alternative DEX format (uint64)
		const ALT_DEPOSIT_SELECTOR = '3d013e7d';
		const ALT_WITHDRAW_SELECTOR = '2c3e5eff';

		// Additional observed selectors
		const OBSERVED_DEPOSIT_SELECTOR = '192a776c'; // Humble Deposit selector
		const OBSERVED_WITHDRAW_SELECTOR = '151f7c75'; // Humble Withdraw selector

		// Combined selectors
		const DEPOSIT_SELECTORS = [DEPOSIT_SELECTOR, ALT_DEPOSIT_SELECTOR, OBSERVED_DEPOSIT_SELECTOR];
		const WITHDRAW_SELECTORS = [
			WITHDRAW_SELECTOR,
			ALT_WITHDRAW_SELECTOR,
			OBSERVED_WITHDRAW_SELECTOR
		];

		// Direct selector matching first
		const isDepositBySelector = DEPOSIT_SELECTORS.includes(selector);
		const isWithdrawBySelector = WITHDRAW_SELECTORS.includes(selector);

		// Special handling for Humble selectors
		if (selector === OBSERVED_DEPOSIT_SELECTOR) {
			return { isDeposit: true, isWithdraw: false };
		} else if (selector === OBSERVED_WITHDRAW_SELECTOR) {
			return { isDeposit: false, isWithdraw: true };
		}

		if (isDepositBySelector || isWithdrawBySelector) {
			// Determine which format matched
			/* eslint-disable @typescript-eslint/no-unused-vars -- Retain the existing decoder bookkeeping. */
			let formatMatched = 'unknown';
			if (selector === DEPOSIT_SELECTOR || selector === WITHDRAW_SELECTOR) {
				formatMatched = 'standard (uint256)';
			} else if (selector === ALT_DEPOSIT_SELECTOR || selector === ALT_WITHDRAW_SELECTOR) {
				formatMatched = 'alternative (uint64)';
			} else if (
				selector === OBSERVED_DEPOSIT_SELECTOR ||
				selector === OBSERVED_WITHDRAW_SELECTOR
			) {
				formatMatched = 'Humble format';
			}
			/* eslint-enable @typescript-eslint/no-unused-vars */

			return {
				isDeposit: isDepositBySelector,
				isWithdraw: isWithdrawBySelector
			};
		}

		// Try to decode using all available decoders
		let isDepositByStructure = false;
		let isWithdrawByStructure = false;
		let depositConfidence = 0;
		let withdrawConfidence = 0;

		// Try standard format decoders
		try {
			const depositData = decodeDepositEvent(log);
			if (
				depositData !== null &&
				depositData.outLpt > 0n &&
				(depositData.inAmts[0] > 0n || depositData.inAmts[1] > 0n)
			) {
				isDepositByStructure = true;
				depositConfidence = 1;
				console.log('Identified as Deposit by structure');
			}
		} catch (e) {
			console.log('Failed to decode as Deposit:', e);
		}

		try {
			const withdrawData = decodeWithdrawEvent(log);
			if (
				withdrawData !== null &&
				withdrawData.inLpt > 0n &&
				(withdrawData.outAmts[0] > 0n || withdrawData.outAmts[1] > 0n)
			) {
				isWithdrawByStructure = true;
				withdrawConfidence = 1;
				console.log('Identified as Withdraw by structure');
			}
		} catch (e) {
			console.log('Failed to decode as Withdraw:', e);
		}

		// Try alternative format decoders
		if (!isDepositByStructure || depositConfidence < 2) {
			try {
				const altDepositData = decodeAltDepositEvent(log);
				if (
					altDepositData !== null &&
					altDepositData.outLpt > 0n &&
					(altDepositData.inAmts[0] > 0n || altDepositData.inAmts[1] > 0n)
				) {
					isDepositByStructure = true;
					depositConfidence = 2; // Higher confidence for alternative format
				}
			} catch (e) {
				console.log('Failed to decode as Alt Deposit:', e);
			}
		}

		if (!isWithdrawByStructure || withdrawConfidence < 2) {
			try {
				const altWithdrawData = decodeAltWithdrawEvent(log);
				if (
					altWithdrawData !== null &&
					altWithdrawData.inLpt > 0n &&
					(altWithdrawData.outAmts[0] > 0n || altWithdrawData.outAmts[1] > 0n)
				) {
					isWithdrawByStructure = true;
					withdrawConfidence = 2; // Higher confidence for alternative format
				}
			} catch (e) {
				console.log('Failed to decode as Alt Withdraw:', e);
			}
		}

		// If we can identify one but not the other, use that
		if (isDepositByStructure && !isWithdrawByStructure) {
			return { isDeposit: true, isWithdraw: false };
		} else if (!isDepositByStructure && isWithdrawByStructure) {
			return { isDeposit: false, isWithdraw: true };
		} else if (isDepositByStructure && isWithdrawByStructure) {
			// If both match, use confidence level to decide
			if (depositConfidence > withdrawConfidence) {
				return { isDeposit: true, isWithdraw: false };
			} else if (withdrawConfidence > depositConfidence) {
				return { isDeposit: false, isWithdraw: true };
			} else {
				// For the observed format, check if the log looks more like a Deposit or Withdraw
				// In this specific DEX, the token order might be swapped
				if (log.length >= 196) {
					try {
						// Check if the first value after the address is non-zero (likely inLpt for Withdraw)
						const potentialInLptHex = log.slice(36, 68).toString('hex');
						if (
							potentialInLptHex &&
							potentialInLptHex !==
								'0000000000000000000000000000000000000000000000000000000000000000'
						) {
							return { isDeposit: false, isWithdraw: true };
						} else {
							return { isDeposit: true, isWithdraw: false };
						}
					} catch (e) {
						console.log('Error during detailed structure check:', e);
					}
				}
			}
		}

		// If we still can't determine, use log length as a heuristic
		if (log.length >= 196) {
			// For logs of this length, check if it looks more like a Withdraw
			// In a Withdraw event, the first value after the address should be non-zero (inLpt)
			try {
				const potentialInLptHex = log.slice(36, 68).toString('hex');
				if (
					potentialInLptHex &&
					potentialInLptHex !== '0000000000000000000000000000000000000000000000000000000000000000'
				) {
					return { isDeposit: false, isWithdraw: true };
				} else {
					return { isDeposit: true, isWithdraw: false };
				}
			} catch (e) {
				console.log('Error checking inLpt value:', e);
			}
		}

		return { isDeposit: false, isWithdraw: false };
	} catch (e) {
		console.error('Error during event type determination:', e);
		return { isDeposit: false, isWithdraw: false };
	}
}

// Function to decode a Deposit event
export function decodeDepositEvent(log: Buffer): {
	sender: string;
	inAmts: [bigint, bigint];
	outLpt: bigint;
	poolBals: [bigint, bigint];
} | null {
	try {
		// Check if the log is long enough to contain all the required data
		if (log.length < 196) {
			return null;
		}

		// Skip the first 4 bytes (event selector)
		// Sender address (32 bytes)
		const sender = '0x' + log.slice(4, 36).toString('hex');

		// Helper function to safely convert hex to BigInt
		const safeHexToBigInt = (hex: string): bigint => {
			if (!hex || hex === '0x' || hex === '') {
				console.log('Empty hex string, defaulting to 0');
				return 0n;
			}
			try {
				return BigInt(`0x${hex}`);
			} catch (e) {
				console.error('Invalid hex string:', hex);
				return 0n;
			}
		};

		// inAmts (two uint256 values)
		const inAmt1Hex = log.slice(36, 68).toString('hex');
		const inAmt1 = safeHexToBigInt(inAmt1Hex);

		const inAmt2Hex = log.slice(68, 100).toString('hex');
		const inAmt2 = safeHexToBigInt(inAmt2Hex);

		// outLpt (uint256)
		const outLptHex = log.slice(100, 132).toString('hex');
		const outLpt = safeHexToBigInt(outLptHex);

		// poolBals (two uint256 values)
		const poolBal1Hex = log.slice(132, 164).toString('hex');
		const poolBal1 = safeHexToBigInt(poolBal1Hex);

		const poolBal2Hex = log.slice(164, 196).toString('hex');
		const poolBal2 = safeHexToBigInt(poolBal2Hex);

		return {
			sender,
			inAmts: [inAmt1, inAmt2],
			outLpt,
			poolBals: [poolBal1, poolBal2]
		};
	} catch (error) {
		console.error('Error decoding Deposit event:', error);
		return null;
	}
}

// Function to decode a Withdraw event
export function decodeWithdrawEvent(log: Buffer): {
	sender: string;
	inLpt: bigint;
	outAmts: [bigint, bigint];
	poolBals: [bigint, bigint];
} | null {
	try {
		// Check if the log is long enough to contain all the required data
		if (log.length < 196) {
			return null;
		}

		// Skip the first 4 bytes (event selector)
		// Sender address (32 bytes)
		const sender = '0x' + log.slice(4, 36).toString('hex');

		// Helper function to safely convert hex to BigInt
		const safeHexToBigInt = (hex: string): bigint => {
			if (!hex || hex === '0x' || hex === '') {
				console.log('Empty hex string, defaulting to 0');
				return 0n;
			}
			try {
				return BigInt(`0x${hex}`);
			} catch (e) {
				console.error('Invalid hex string:', hex);
				return 0n;
			}
		};

		// inLpt (uint256)
		const inLptHex = log.slice(36, 68).toString('hex');
		const inLpt = safeHexToBigInt(inLptHex);

		// outAmts (two uint256 values)
		const outAmt1Hex = log.slice(68, 100).toString('hex');
		const outAmt1 = safeHexToBigInt(outAmt1Hex);

		const outAmt2Hex = log.slice(100, 132).toString('hex');
		const outAmt2 = safeHexToBigInt(outAmt2Hex);

		// poolBals (two uint256 values)
		const poolBal1Hex = log.slice(132, 164).toString('hex');
		const poolBal1 = safeHexToBigInt(poolBal1Hex);

		const poolBal2Hex = log.slice(164, 196).toString('hex');
		const poolBal2 = safeHexToBigInt(poolBal2Hex);

		return {
			sender,
			inLpt,
			outAmts: [outAmt1, outAmt2],
			poolBals: [poolBal1, poolBal2]
		};
	} catch (error) {
		console.error('Error decoding Withdraw event:', error);
		return null;
	}
}

// Function to decode an alternative format Deposit event (uint64)
export function decodeAltDepositEvent(log: Buffer): {
	sender: string;
	inAmts: [bigint, bigint];
	outLpt: bigint;
	poolBals: [bigint, bigint];
	reserves?: [bigint, bigint]; // Additional parameter
} | null {
	try {
		// Check if the log is long enough to contain all the required data
		// For the alt format with an extra tuple, we need more bytes
		if (log.length < 228) {
			// 4 + 32 + 32*2 + 32 + 32*2 + 32*2
			return null;
		}

		// Skip the first 4 bytes (event selector)
		// Sender address (32 bytes)
		const sender = '0x' + log.slice(4, 36).toString('hex');

		// Helper function to safely convert hex to BigInt
		const safeHexToBigInt = (hex: string): bigint => {
			if (!hex || hex === '0x' || hex === '') {
				console.log('Empty hex string, defaulting to 0');
				return 0n;
			}
			try {
				return BigInt(`0x${hex}`);
			} catch (e) {
				console.error('Invalid hex string:', hex);
				return 0n;
			}
		};

		// inAmts (two uint64 values in a tuple)
		const inAmt1Hex = log.slice(36, 68).toString('hex');
		const inAmt1 = safeHexToBigInt(inAmt1Hex);

		const inAmt2Hex = log.slice(68, 100).toString('hex');
		const inAmt2 = safeHexToBigInt(inAmt2Hex);

		// outLpt (uint64)
		const outLptHex = log.slice(100, 132).toString('hex');
		const outLpt = safeHexToBigInt(outLptHex);

		// poolBals (two uint64 values in a tuple)
		const poolBal1Hex = log.slice(132, 164).toString('hex');
		const poolBal1 = safeHexToBigInt(poolBal1Hex);

		const poolBal2Hex = log.slice(164, 196).toString('hex');
		const poolBal2 = safeHexToBigInt(poolBal2Hex);

		// reserves (two uint64 values in a tuple) - additional parameter
		const reserve1Hex = log.slice(196, 228).toString('hex');
		const reserve1 = safeHexToBigInt(reserve1Hex);

		const reserve2Hex = log.slice(228, 260).toString('hex');
		const reserve2 = safeHexToBigInt(reserve2Hex);

		return {
			sender,
			inAmts: [inAmt1, inAmt2],
			outLpt,
			poolBals: [poolBal1, poolBal2],
			reserves: [reserve1, reserve2]
		};
	} catch (error) {
		console.error('Error decoding Alt Deposit event:', error);
		return null;
	}
}

// Function to decode an alternative format Withdraw event (uint64)
export function decodeAltWithdrawEvent(log: Buffer): {
	sender: string;
	inLpt: bigint;
	outAmts: [bigint, bigint];
	poolBals: [bigint, bigint];
	reserves?: [bigint, bigint]; // Additional parameter
} | null {
	try {
		// Check if the log is long enough to contain all the required data
		// For the alt format with an extra tuple, we need more bytes
		if (log.length < 228) {
			// 4 + 32 + 32 + 32*2 + 32*2 + 32*2
			return null;
		}

		// Skip the first 4 bytes (event selector)
		// Sender address (32 bytes)
		const sender = '0x' + log.slice(4, 36).toString('hex');

		// Helper function to safely convert hex to BigInt
		const safeHexToBigInt = (hex: string): bigint => {
			if (!hex || hex === '0x' || hex === '') {
				console.log('Empty hex string, defaulting to 0');
				return 0n;
			}
			try {
				return BigInt(`0x${hex}`);
			} catch (e) {
				console.error('Invalid hex string:', hex);
				return 0n;
			}
		};

		// inLpt (uint64)
		const inLptHex = log.slice(36, 68).toString('hex');
		const inLpt = safeHexToBigInt(inLptHex);

		// outAmts (two uint64 values in a tuple)
		const outAmt1Hex = log.slice(68, 100).toString('hex');
		const outAmt1 = safeHexToBigInt(outAmt1Hex);

		const outAmt2Hex = log.slice(100, 132).toString('hex');
		const outAmt2 = safeHexToBigInt(outAmt2Hex);

		// poolBals (two uint64 values in a tuple)
		const poolBal1Hex = log.slice(132, 164).toString('hex');
		const poolBal1 = safeHexToBigInt(poolBal1Hex);

		const poolBal2Hex = log.slice(164, 196).toString('hex');
		const poolBal2 = safeHexToBigInt(poolBal2Hex);

		// reserves (two uint64 values in a tuple) - additional parameter
		const reserve1Hex = log.slice(196, 228).toString('hex');
		const reserve1 = safeHexToBigInt(reserve1Hex);

		const reserve2Hex = log.slice(228, 260).toString('hex');
		const reserve2 = safeHexToBigInt(reserve2Hex);

		return {
			sender,
			inLpt,
			outAmts: [outAmt1, outAmt2],
			poolBals: [poolBal1, poolBal2],
			reserves: [reserve1, reserve2]
		};
	} catch (error) {
		console.error('Error decoding Alt Withdraw event:', error);
		return null;
	}
}
