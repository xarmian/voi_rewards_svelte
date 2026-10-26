import { tick } from 'svelte';

export type CopyFeedback = {
	status: 'idle' | 'copied' | 'failed';
	announcement: string;
};

export function createCopyHandler(feedback: CopyFeedback) {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let run = 0;
	async function copy(text: string, what: string) {
		const mine = ++run;
		let status: CopyFeedback['status'];
		try {
			if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText)
				throw new Error('Clipboard unavailable');
			// Invoke before yielding so Safari retains the click's user gesture.
			await navigator.clipboard.writeText(text);
			status = 'copied';
		} catch {
			status = 'failed';
		}
		if (mine !== run) return;
		clearTimeout(timeout);
		feedback.announcement = '';
		await tick();
		if (mine !== run) return;
		feedback.status = status;
		feedback.announcement = status === 'copied' ? `Copied ${what}` : 'Copy failed';
		timeout = setTimeout(() => {
			if (mine !== run) return;
			feedback.status = 'idle';
			feedback.announcement = '';
		}, 1500);
	}
	return {
		copy,
		destroy: () => {
			run++;
			clearTimeout(timeout);
		}
	};
}
