/**
 * Whether a token logo image should be shown: it has a URL, and that URL is not the one that last
 * failed to load. A failure is remembered for one URL, so selecting a token with a different logo
 * shows it again without remounting the image.
 */
export function logoVisible(
	imageUrl: string | null | undefined,
	failedUrl: string | null
): boolean {
	return !!imageUrl && imageUrl !== failedUrl;
}
