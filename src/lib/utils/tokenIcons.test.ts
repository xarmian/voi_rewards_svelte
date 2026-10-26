import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function mockBrowser() {
	const pixels = new Uint8ClampedArray([
		255, 255, 255, 255, 251, 251, 251, 128, 250, 255, 255, 255, 255, 249, 255, 128
	]);
	const context = {
		drawImage: vi.fn(),
		getImageData: vi.fn(() => ({ data: pixels })),
		putImageData: vi.fn()
	};
	const canvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => context),
		toDataURL: vi.fn(() => 'data:image/png;base64,processed')
	};
	vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
	class FakeImage {
		width = 4;
		height = 1;
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		src = '';
		constructor() {
			queueMicrotask(() => this.onload?.());
		}
	}
	vi.stubGlobal('Image', FakeImage);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:token-icon');
	const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	return { pixels, context, canvas, revoke };
}

const okResponse = () => new Response(new Blob(['icon']), { status: 200 });

beforeEach(() => {
	vi.resetModules();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('token icons', () => {
	it('maps local, aliased and ordinary icon URLs and skips local probes', async () => {
		mockBrowser();
		const fetcher = vi.fn();
		vi.stubGlobal('fetch', fetcher);
		const { iconUrl, getProcessedIcon, isIconMissing } = await import('./tokenIcons');
		expect(iconUrl('390001')).toBe('/icons/voi-token.png');
		expect(iconUrl('302190')).toBe('https://asset-verification.nautilus.sh/icons/395614.png');
		expect(iconUrl('123')).toBe('https://asset-verification.nautilus.sh/icons/123.png');
		expect(await getProcessedIcon('390001')).toBeNull();
		expect(isIconMissing('390001')).toBe(false);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('shares one promise and fetch across callers, including after resolution', async () => {
		const { pixels, canvas, revoke } = mockBrowser();
		const fetcher = vi.fn().mockResolvedValue(okResponse());
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon } = await import('./tokenIcons');
		const first = getProcessedIcon('302190');
		expect(getProcessedIcon('302190')).toBe(first);
		expect(getProcessedIcon('302190')).toBe(first);
		expect(await first).toBe('data:image/png;base64,processed');
		expect(getProcessedIcon('302190')).toBe(first);
		expect(fetcher).toHaveBeenCalledExactlyOnceWith(
			'https://asset-verification.nautilus.sh/icons/395614.png',
			{ signal: expect.any(AbortSignal) }
		);
		expect([...pixels]).toEqual([
			255, 255, 255, 0, 251, 251, 251, 0, 250, 255, 255, 255, 255, 249, 255, 128
		]);
		expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
		expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:token-icon');
	});

	it.each(['http', 'network', 'decode', 'canvas', 'pixels', 'encode'])(
		'remembers %s failures, marks only HTTP misses and releases object URLs',
		async (failure) => {
			const { canvas, context, revoke } = mockBrowser();
			const fetcher = vi.fn().mockImplementation(async () => {
				if (failure === 'network') throw new Error('offline');
				return failure === 'http' ? new Response(null, { status: 404 }) : okResponse();
			});
			vi.stubGlobal('fetch', fetcher);
			if (failure === 'decode') {
				vi.stubGlobal(
					'Image',
					class {
						onerror: (() => void) | null = null;
						src = '';
						constructor() {
							queueMicrotask(() => this.onerror?.());
						}
					}
				);
			}
			if (failure === 'canvas') canvas.getContext.mockReturnValueOnce(null!);
			if (failure === 'pixels') {
				context.getImageData.mockImplementationOnce(() => {
					throw new Error('tainted canvas');
				});
			}
			if (failure === 'encode') {
				canvas.toDataURL.mockImplementationOnce(() => {
					throw new Error('cannot encode');
				});
			}
			const { getProcessedIcon, isIconMissing } = await import('./tokenIcons');
			expect(await getProcessedIcon('404')).toBeNull();
			expect(isIconMissing('404')).toBe(failure === 'http');
			expect(await getProcessedIcon('404')).toBeNull();
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(revoke).toHaveBeenCalledTimes(['http', 'network'].includes(failure) ? 0 : 1);
		}
	);

	it.each(['fetch', 'blob', 'decode'])(
		'times out a hung %s after 10 seconds, starts the seventh probe and keeps raw icons eligible',
		async (stage) => {
			vi.useFakeTimers();
			const { context, revoke } = mockBrowser();
			const response = deferred<Response>();
			const blob = deferred<Blob>();
			const images: { onload: (() => void) | null; onerror: (() => void) | null }[] = [];
			if (stage === 'decode') {
				vi.stubGlobal(
					'Image',
					class {
						width = 4;
						height = 1;
						onload: (() => void) | null = null;
						onerror: (() => void) | null = null;
						src = '';
						constructor() {
							images.push(this);
							if (images.length > 6) queueMicrotask(() => this.onload?.());
						}
					}
				);
			}
			const signals: AbortSignal[] = [];
			const fetcher = vi.fn((_url: string, options?: RequestInit): Promise<Response> => {
				if (options?.signal) signals.push(options.signal);
				if (fetcher.mock.calls.length > 6) return Promise.resolve(okResponse());
				if (stage === 'fetch') return response.promise;
				if (stage === 'blob') {
					return Promise.resolve({ ok: true, blob: () => blob.promise } as Response);
				}
				// Spend eight seconds fetching and reading the blob before decode stalls.
				return new Promise<Response>((resolve) => {
					setTimeout(
						() =>
							resolve({
								ok: true,
								blob: () =>
									new Promise<Blob>((done) => {
										setTimeout(() => done(new Blob(['icon'])), 4000);
									})
							} as Response),
						4000
					);
				});
			});
			vi.stubGlobal('fetch', fetcher);
			const { getProcessedIcon, isIconMissing } = await import('./tokenIcons');
			const promises = Array.from({ length: 7 }, (_, i) => getProcessedIcon(String(i)));
			const settled = vi.fn();
			void promises[0].then(settled);
			expect(fetcher).toHaveBeenCalledTimes(6);
			await vi.advanceTimersByTimeAsync(9999);
			expect(fetcher).toHaveBeenCalledTimes(6);
			expect(settled).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(fetcher).toHaveBeenCalledTimes(7);
			expect(await Promise.all(promises)).toEqual([
				...Array(6).fill(null),
				'data:image/png;base64,processed'
			]);
			expect(signals.slice(0, 6)).toHaveLength(6);
			expect(signals.slice(0, 6).every((signal) => signal.aborted)).toBe(true);
			for (let i = 0; i < 6; i += 1) expect(isIconMissing(String(i))).toBe(false);
			expect(getProcessedIcon('0')).toBe(promises[0]);
			expect(revoke).toHaveBeenCalledTimes(stage === 'decode' ? 7 : 1);
			expect(context.drawImage).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);

			// Late responses cannot mark a timed-out icon missing or resume processing.
			response.resolve(new Response(null, { status: 404 }));
			blob.resolve(new Blob(['late icon']));
			images.slice(0, 6).forEach((image) => image.onload?.());
			await vi.advanceTimersByTimeAsync(0);
			for (let i = 0; i < 6; i += 1) expect(isIconMissing(String(i))).toBe(false);
			expect(context.drawImage).toHaveBeenCalledTimes(1);
			expect(revoke).toHaveBeenCalledTimes(stage === 'decode' ? 7 : 1);
		}
	);

	it.each(['', undefined])('skips an empty or undefined id (%s) without fetching', async (id) => {
		mockBrowser();
		const fetcher = vi.fn().mockImplementation(async () => okResponse());
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon, iconUrl } = await import('./tokenIcons');
		expect(await getProcessedIcon(id as string)).toBeNull();
		expect(iconUrl(id as string)).toBe('/icons/default-token-image.svg');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('shares one cache entry and fetch for numeric 0 and string 0', async () => {
		mockBrowser();
		const fetcher = vi.fn().mockImplementation(async () => okResponse());
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon } = await import('./tokenIcons');
		const first = getProcessedIcon(0);
		expect(getProcessedIcon('0')).toBe(first);
		expect(await first).toBe('data:image/png;base64,processed');
		expect(getProcessedIcon('0')).toBe(first);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('shares misses between numeric 0 and string 0', async () => {
		mockBrowser();
		const fetcher = vi.fn();
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon, isIconMissing, markIconMissing } = await import('./tokenIcons');
		markIconMissing(0);
		expect(isIconMissing('0')).toBe(true);
		expect(isIconMissing(0)).toBe(true);
		expect(await getProcessedIcon('0')).toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('caps 20 requests at six probes, drains FIFO and shares queued promises', async () => {
		mockBrowser();
		const responses = Array.from({ length: 20 }, () => deferred<Response>());
		let active = 0;
		let maximum = 0;
		let nextResponse = 0;
		const fetcher = vi.fn<(url: string) => Promise<Response>>(() => {
			const index = nextResponse++;
			active += 1;
			maximum = Math.max(maximum, active);
			return responses[index].promise.finally(() => (active -= 1));
		});
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon } = await import('./tokenIcons');
		const promises = Array.from({ length: 20 }, (_, i) => getProcessedIcon(String(i + 1)));
		expect(getProcessedIcon('20')).toBe(promises[19]);
		expect(fetcher).toHaveBeenCalledTimes(6);
		for (let i = 0; i < 20; i += 1) {
			responses[i].resolve(okResponse());
			await promises[i];
			expect(fetcher).toHaveBeenCalledTimes(Math.min(20, i + 7));
		}
		expect(maximum).toBe(6);
		expect(fetcher.mock.calls.map((call) => call[0])).toEqual(
			Array.from(
				{ length: 20 },
				(_, i) => `https://asset-verification.nautilus.sh/icons/${i + 1}.png`
			)
		);
		expect(await Promise.all(promises)).toEqual(Array(20).fill('data:image/png;base64,processed'));
	});

	it('holds a probe slot until decoding and canvas processing finish', async () => {
		mockBrowser();
		const images: { onerror: (() => void) | null }[] = [];
		vi.stubGlobal(
			'Image',
			class {
				onerror: (() => void) | null = null;
				constructor() {
					images.push(this);
				}
			}
		);
		const fetcher = vi.fn().mockImplementation(async () => okResponse());
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon } = await import('./tokenIcons');
		const promises = Array.from({ length: 7 }, (_, i) => getProcessedIcon(String(i)));
		await vi.waitFor(() => expect(images).toHaveLength(6));
		expect(fetcher).toHaveBeenCalledTimes(6);
		images[0].onerror?.();
		await promises[0];
		await vi.waitFor(() => expect(images).toHaveLength(7));
		images.slice(1).forEach((img) => img.onerror?.());
		await Promise.all(promises);
	});

	it('shares misses marked by card or modal errors and skips later probes', async () => {
		mockBrowser();
		const fetcher = vi.fn();
		vi.stubGlobal('fetch', fetcher);
		const { isIconMissing, markIconMissing, getProcessedIcon } = await import('./tokenIcons');
		expect(isIconMissing('123')).toBe(false);
		markIconMissing('123');
		markIconMissing('123');
		expect(isIconMissing('123')).toBe(true);
		expect(await getProcessedIcon('123')).toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('skips a queued probe if an image error marks it missing before it starts', async () => {
		mockBrowser();
		const response = deferred<Response>();
		const fetcher = vi.fn(() => response.promise);
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon, markIconMissing } = await import('./tokenIcons');
		const promises = Array.from({ length: 7 }, (_, i) => getProcessedIcon(String(i)));
		markIconMissing('6');
		response.resolve(new Response(null, { status: 404 }));
		expect(await Promise.all(promises)).toEqual(Array(7).fill(null));
		expect(fetcher).toHaveBeenCalledTimes(6);
	});

	it('is safe to import and call on the server without fetching or poisoning client misses', async () => {
		vi.stubGlobal('document', undefined);
		const fetcher = vi.fn().mockImplementation(async () => okResponse());
		vi.stubGlobal('fetch', fetcher);
		const { getProcessedIcon, isIconMissing } = await import('./tokenIcons');
		expect(fetcher).not.toHaveBeenCalled();
		expect(await getProcessedIcon('123')).toBeNull();
		expect(isIconMissing('123')).toBe(false);
		expect(fetcher).not.toHaveBeenCalled();
		mockBrowser();
		expect(await getProcessedIcon('123')).toBe('data:image/png;base64,processed');
	});
});
