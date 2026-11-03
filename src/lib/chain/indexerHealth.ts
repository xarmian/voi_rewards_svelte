export interface ExpiryProbeDeps {
	algodRound(): Promise<number>;
	indexerHasBlock(round: number): Promise<boolean>;
}

export async function indexerCaughtUpPast(
	lastValid: number,
	deps: ExpiryProbeDeps,
	{ timeoutMs = 10000 }: { timeoutMs?: number } = {}
): Promise<boolean> {
	const probe = async () => {
		try {
			const round = await deps.algodRound();
			return (
				Number.isFinite(round) &&
				round > lastValid &&
				(await deps.indexerHasBlock(lastValid)) === true
			);
		} catch {
			return false;
		}
	};
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			probe(),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(() => resolve(false), timeoutMs);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}
