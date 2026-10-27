export function errorClass(variant: 'hero' | 'compact', tone: 'surface' | 'hero'): string {
	if (variant === 'hero') return 'mt-2 text-sm text-on-hero';
	return tone === 'hero'
		? 'absolute inset-x-0 top-full z-20 mt-2 rounded-ds-sm border border-edge bg-surface p-2 text-sm text-danger shadow-pop'
		: 'mt-2 text-sm text-danger';
}

export function shouldCollapse({
	compact,
	collapsible,
	revealed,
	leaving,
	hasError,
	submitted
}: {
	compact: boolean;
	collapsible: boolean;
	revealed: boolean;
	leaving: boolean;
	hasError: boolean;
	submitted: boolean;
}): boolean {
	return compact && collapsible && revealed && (submitted || (leaving && !hasError));
}
