const ICON_HOST = 'https://asset-verification.nautilus.sh/icons/';
const processedIcons = new Map<string, Promise<string | null>>();
const missingIcons = new Set<string>();
const probeQueue: (() => void)[] = [];
let activeProbes = 0;

export function iconUrl(tokenId: string | number): string {
	if (tokenId == null || tokenId === '') return '/icons/default-token-image.svg';
	const id = String(tokenId);
	if (id === '390001') return '/icons/voi-token.png';
	return `${ICON_HOST}${id === '302190' ? '395614' : id}.png`;
}

export function isIconMissing(tokenId: string | number): boolean {
	return missingIcons.has(String(tokenId));
}

export function markIconMissing(tokenId: string | number): void {
	missingIcons.add(String(tokenId));
}

async function processIcon(tokenId: string): Promise<string | null> {
	// An img may have failed while this probe was waiting for a slot.
	if (isIconMissing(tokenId)) return null;

	const controller = new AbortController();
	let objectUrl: string | undefined;
	let image: HTMLImageElement | undefined;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	// One deadline covers fetch, body consumption and image decoding.
	const timeout = new Promise<null>((resolve) => {
		timeoutId = setTimeout(() => {
			controller.abort();
			resolve(null);
		}, 10_000);
	});

	async function probe(): Promise<string | null> {
		const response = await fetch(iconUrl(tokenId), { signal: controller.signal });
		if (controller.signal.aborted) return null;
		if (!response.ok) {
			markIconMissing(tokenId);
			return null;
		}

		const blob = await response.blob();
		if (controller.signal.aborted) return null;
		objectUrl = URL.createObjectURL(blob);
		const img = new Image();
		image = img;
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('Token icon decode failed'));
			img.src = objectUrl!;
		});
		if (controller.signal.aborted) return null;

		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas unavailable');

		ctx.drawImage(img, 0, 0);
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const data = imageData.data;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) {
				data[i + 3] = 0;
			}
		}
		ctx.putImageData(imageData, 0, 0);
		return canvas.toDataURL('image/png');
	}

	try {
		return await Promise.race([probe(), timeout]);
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
		if (image) {
			image.onload = null;
			image.onerror = null;
		}
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	}
}

function drainQueue(): void {
	while (activeProbes < 6 && probeQueue.length > 0) {
		probeQueue.shift()!();
	}
}

export function getProcessedIcon(tokenId: string | number): Promise<string | null> {
	// Do not let an SSR call populate the browser's session cache or miss set.
	if (tokenId == null || tokenId === '' || typeof document === 'undefined') {
		return Promise.resolve(null);
	}
	const id = String(tokenId);
	const cached = processedIcons.get(id);
	if (cached) return cached;

	let result: Promise<string | null>;
	if (isIconMissing(id) || !iconUrl(id).startsWith(ICON_HOST)) {
		result = Promise.resolve(null);
	} else {
		result = new Promise((resolve) => {
			probeQueue.push(() => {
				activeProbes += 1;
				processIcon(id).then((icon) => {
					activeProbes -= 1;
					resolve(icon);
					drainQueue();
				});
			});
			drainQueue();
		});
	}
	processedIcons.set(id, result);
	return result;
}
