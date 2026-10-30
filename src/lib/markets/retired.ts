// TASK-88: exchanges that have shut down. Mimir still indexes their contracts, so their rows keep
// arriving; they are filtered by name, not by staleness.
const RETIRED_EXCHANGES = new Set(['nomadex']);

export function isRetiredExchange(name: unknown): boolean {
	return typeof name === 'string' && RETIRED_EXCHANGES.has(name.trim().toLowerCase());
}
