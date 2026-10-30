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
	}
	return null;
}
