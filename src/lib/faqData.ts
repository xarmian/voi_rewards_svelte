import faqDataRaw from '$lib/faqData.json';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
  sort: number;
  recent?: string;
}

export const faqData: FAQItem[] = faqDataRaw.sort((a, b) => a.sort - b.sort);