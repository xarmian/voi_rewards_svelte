// Helper function to generate pool URLs based on exchange
export function getPoolUrl(
	exchange: string,
	poolId: number,
	tokenAId: number,
	tokenAType: string,
	tokenBId: number,
	tokenBType: string
): string | null {
	if (exchange === 'humble') {
		return `https://voi.humble.sh/#/swap?poolId=${poolId}`;
	} else if (exchange === 'nomadex') {
		// Map token types to Nomadex URL format
		const getTokenTypeCode = (type: string) => {
			switch (type?.toUpperCase()) {
				case 'VOI':
					return 0;
				case 'ASA':
					return 1;
				case 'ARC200':
					return 2;
				default:
					return 2; // Default to ARC200 if unknown
			}
		};

		const typeA = getTokenTypeCode(tokenAType);
		const typeB = getTokenTypeCode(tokenBType);

		// Use actual token IDs as-is
		return `https://voi.nomadex.app/${typeA}/${tokenAId}/${typeB}/${tokenBId}`;
	}
	return null;
}
