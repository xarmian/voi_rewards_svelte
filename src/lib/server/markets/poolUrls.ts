// Helper function to generate pool URLs based on exchange (Nomadex retired: TASK-88)
export function getPoolUrl(exchange: string, poolId: number): string | null {
	if (exchange === 'humble') {
		return `https://voi.humble.sh/#/swap?poolId=${poolId}`;
	}
	return null;
}
