import { faqData } from '$lib/faqData';
import { FAQ_HIGHLIGHTS } from './guides';
import { faqHighlights } from './highlights';

export const prerender = true;

export function load() {
	return { faqHighlights: faqHighlights(faqData, FAQ_HIGHLIGHTS) };
}
