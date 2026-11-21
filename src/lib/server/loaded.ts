// The home load's shared result shape, parsers and deadlines: used by the home load and
// by the epoch-rewards half it starts, so neither imports the other's internals.
export const CRITICAL_TIMEOUT_MS = 4000;
export const STREAM_TIMEOUT_MS = 5000;
// The stake history upstream routinely takes 3.6-4.3 s; it is streamed, so a longer deadline blocks nothing.
export const STAKE_TIMEOUT_MS = 8000;

export type Loaded<T> =
	| { state: 'ready'; value: T }
	| { state: 'stale'; value: T; asOf: string }
	| { state: 'error'; message: string };
export const ready = <T>(value: T): Loaded<T> => ({ state: 'ready', value });
export const failure = (message: string): { state: 'error'; message: string } => ({
	state: 'error',
	message
});
export const record = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid response');
	return value as Record<string, unknown>;
};
export const list = (value: unknown): unknown[] => {
	if (!Array.isArray(value)) throw new Error('Invalid list');
	return value;
};
