export type DataState = 'loading' | 'ready' | 'empty' | 'stale' | 'error';
export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

export const glyphs: Record<Tone, { pill: string; health: string }> = {
	ok: { pill: '●', health: '✓' },
	warn: { pill: '!', health: '!' },
	danger: { pill: '✕', health: '✕' },
	neutral: { pill: '○', health: '○' },
	info: { pill: '◆', health: '◆' }
};

export const toneClasses: Record<Tone, string> = {
	ok: 'bg-ok-soft text-ok',
	warn: 'bg-warn-soft text-warn',
	danger: 'bg-danger-soft text-danger',
	neutral: 'bg-surface-2 text-ink-muted',
	info: 'bg-accent-soft text-accent'
};
