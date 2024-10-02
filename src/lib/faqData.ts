import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
  sort: number;
}

function parseFrontmatter(frontmatter: string): { question: string; category: string; sort: number } {
  const lines = frontmatter.split('\n');
  const result: { [key: string]: string | number } = {};

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':').map(part => part.trim());
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim();
      if (key === 'sort') {
        result[key] = parseInt(value, 10);
      } else {
        // Remove surrounding quotes and preserve internal formatting
        result[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return {
    question: result.question as string || '',
    category: result.category as string || '',
    sort: result.sort as number || 0
  };
}

const faqDir = join(process.cwd(), 'src', 'content', 'faq');
const files = readdirSync(faqDir);
const faqItems: FAQItem[] = [];

for (const file of files) {
  if (file.endsWith('.md')) {
    const content = readFileSync(join(faqDir, file), 'utf-8');
    const [frontmatter, ...answerParts] = content.split('---').filter(Boolean);
    const { question, category, sort } = parseFrontmatter(frontmatter.trim());
    const answer = answerParts.join('---').trim();

    faqItems.push({ question, answer, category, sort });
  }
}

// Sort the FAQ items based on the 'sort' field
faqItems.sort((a, b) => a.sort - b.sort);

export const faqData = faqItems;