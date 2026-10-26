import { slug } from '../slug';

export function cardHeadingId(title: string): string {
	return 'ds-card-' + slug(title);
}
