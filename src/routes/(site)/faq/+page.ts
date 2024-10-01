import { faqData } from '$lib/data/faq';

export const load = async ({ url }) => {
    console.log(url);
    const hash = url.href.split('#')[1]; //url.hash.slice(1);
    let highlightedFAQ = null;
    let pageMetaTags = {
        title: 'Frequently Asked Questions | Voi Network',
        description: 'Find answers to common questions about Voi Network',
        imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
    };

    if (hash) {
        highlightedFAQ = faqData.find(item => slugify(item.question) === hash);
        if (highlightedFAQ) {
            pageMetaTags = {
                title: `FAQ: ${highlightedFAQ.question} | Voi Network`,
                description: truncate(highlightedFAQ.answer, 160),
                imageUrl: 'https://voirewards.com/logos/Voi_Logo_White_on_Purple_Background.png',
            };
        }
    }

    return {
        faqData,
        highlightedFAQ,
        pageMetaTags,
    };
};

function slugify(text: string) {
    return text.toLowerCase().replace(/[^\w]+/g, '-');
}

function truncate(text: string, length: number) {
    return text.length > length ? text.substring(0, length - 3) + '...' : text;
}