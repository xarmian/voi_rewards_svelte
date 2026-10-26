const ICON_HOST = 'https://asset-verification.nautilus.sh/icons/';
const processedIcons = new Map<string, Promise<string | null>>();
const missingIcons = new Set<string>();
const probeQueue: (() => void)[] = [];
let activeProbes = 0;

export function iconUrl(tokenId: string): string {
	if (tokenId === '390001') return '/icons/voi-token.png';
	return `${ICON_HOST}${tokenId === '302190' ? '395614' : tokenId}.png`;
}

export function isIconMissing(tokenId: string): boolean {
	return missingIcons.has(tokenId);
}

export function markIconMissing(tokenId: string): void {
	missingIcons.add(tokenId);
}

async function processIcon(tokenId: string): Promise<string | null> {
	// An img may have failed while this probe was waiting for a slot.
	if (isIconMissing(tokenId)) return null;

	try {
		const response = await fetch(iconUrl(tokenId));
		if (!response.ok) throw new Error('Token icon unavailable');

		const objectUrl = URL.createObjectURL(await response.blob());
		try {
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Token icon decode failed'));
				img.src = objectUrl;
			});

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
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	} catch {
		markIconMissing(tokenId);
		return null;
	}
}

function drainQueue(): void {
	while (activeProbes < 6 && probeQueue.length > 0) {
		probeQueue.shift()!();
	}
}

export function getProcessedIcon(tokenId: string): Promise<string | null> {
	// Do not let an SSR call populate the browser's session cache or miss set.
	if (typeof document === 'undefined') return Promise.resolve(null);

	const cached = processedIcons.get(tokenId);
	if (cached) return cached;

	let result: Promise<string | null>;
	if (isIconMissing(tokenId) || !iconUrl(tokenId).startsWith(ICON_HOST)) {
		result = Promise.resolve(null);
	} else {
		result = new Promise((resolve) => {
			probeQueue.push(() => {
				activeProbes += 1;
				processIcon(tokenId).then((icon) => {
					activeProbes -= 1;
					resolve(icon);
					drainQueue();
				});
			});
			drainQueue();
		});
	}
	processedIcons.set(tokenId, result);
	return result;
}
