export function cardHeadingId(title: string): string {
	return (
		'ds-card-' +
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
	);
}
