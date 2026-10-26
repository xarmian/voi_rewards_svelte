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
			'https://asset-verification.nautilus.sh/icons/395614.png'
		);
		expect([...pixels]).toEqual([
			255, 255, 255, 0, 251, 251, 251, 0, 250, 255, 255, 255, 255, 249, 255, 128
		]);
		expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
		expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:token-icon');
	});

	it.each(['http', 'network', 'decode', 'canvas', 'pixels', 'encode'])(
		'remembers %s failures and releases object URLs',
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
			expect(isIconMissing('404')).toBe(true);
			expect(await getProcessedIcon('404')).toBeNull();
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(revoke).toHaveBeenCalledTimes(['http', 'network'].includes(failure) ? 0 : 1);
		}
	);

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
