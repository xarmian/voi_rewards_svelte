export interface Token {
    symbol: string;
    name: string;
    equivalents: string[];
}

export interface TokenPair {
    baseToken: Token;
    quoteToken: Token;
}

// Define known tokens
export const TOKENS: Record<string, Token> = {
    VOI: {
        symbol: 'VOI',
        name: 'VOI',
        equivalents: ['VOI', 'aVOI']
    },
    ALGO: {
        symbol: 'ALGO',
        name: 'Algorand',
        equivalents: ['ALGO', 'aALGO']
    },
    USD: {
        symbol: 'USD',
        name: 'US Dollar',
        equivalents: ['USDT', 'USDC', 'aUSDC']
    },
    UNIT: {
        symbol: 'UNIT',
        name: 'Unit',
        equivalents: ['UNIT', 'aUNIT']
    }
};

// Helper function to get base pair from a trading pair string
export function getBasePair(pair: string): string {
    const [base, quote] = pair.split('/');
    
    // Find the canonical token symbols
    const baseToken = Object.values(TOKENS).find(token => 
        token.equivalents.includes(base)
    );
    const quoteToken = Object.values(TOKENS).find(token => 
        token.equivalents.includes(quote)
    );

    if (!baseToken || !quoteToken) return pair;
    return `${baseToken.symbol}/${quoteToken.symbol}`;
}

// Helper function to check if two pairs are equivalent
export function areEquivalentPairs(pair1: string, pair2: string): boolean {
    return getBasePair(pair1) === getBasePair(pair2);
}

// Helper function to get all possible pair combinations for a base pair
export function getAllPairCombinations(basePair: string): string[] {
    const [baseSymbol, quoteSymbol] = basePair.split('/');
    
    const baseToken = Object.values(TOKENS).find(token => token.symbol === baseSymbol);
    const quoteToken = Object.values(TOKENS).find(token => token.symbol === quoteSymbol);
    
    if (!baseToken || !quoteToken) return [basePair];
    
    const combinations: string[] = [];
    for (const base of baseToken.equivalents) {
        for (const quote of quoteToken.equivalents) {
            combinations.push(`${base}/${quote}`);
        }
    }
    
    return combinations;
} 