export interface ExpiryProbeDeps {
	algodRound(): Promise<number>;
	indexerHasBlock(round: number): Promise<boolean>;
}

export async function indexerCaughtUpPast(
	lastValid: number,
	deps: ExpiryProbeDeps
): Promise<boolean> {
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
}
