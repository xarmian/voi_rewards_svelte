/** Link offsets must be relative to the horizontally scrolling track. */
export function trackScrollLeft(
	track: { scrollLeft: number; clientWidth: number },
	link: { offsetLeft: number; offsetWidth: number }
): number {
	if (link.offsetWidth > track.clientWidth || link.offsetLeft < track.scrollLeft)
		return link.offsetLeft;
	const right = link.offsetLeft + link.offsetWidth;
	return right > track.scrollLeft + track.clientWidth
		? right - track.clientWidth
		: track.scrollLeft;
}
