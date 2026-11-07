export function createAvatarImage(getSrc: () => string | null) {
	// Each source gets its own state and handlers, so late events cannot affect the next image.
	const image = $derived.by(() => {
		const src = getSrc();
		let loaded = $state(false);
		let failed = $state(false);
		return {
			src,
			get show() {
				return src !== null && loaded && !failed;
			},
			onload() {
				loaded = true;
			},
			onerror() {
				failed = true;
			}
		};
	});
	return {
		get src() {
			return image.src;
		},
		get show() {
			return image.show;
		},
		get onload() {
			return image.onload;
		},
		get onerror() {
			return image.onerror;
		}
	};
}
