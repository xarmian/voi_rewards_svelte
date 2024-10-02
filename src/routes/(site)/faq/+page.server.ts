import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
  sort: number;
}

function parseFrontmatter(frontmatter: string): { question: string; category: string; sort: number } {
  const lines = frontmatter.split('\n');
  const data: { [key: string]: string | number } = {};
  
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim();
      // Remove surrounding quotes and preserve internal formatting
      data[key.trim()] = key.trim() === 'sort' ? parseInt(value, 10) : value.replace(/^['"]|['"]$/g, '').trim();
    }
  }

  return {
    question: data.question as string || '',
    category: data.category as string || '',
    sort: data.sort as number || 0
  };
}

export async function load() {
  const faqDir = join(process.cwd(), 'src', 'content', 'faq');
  const files = await readdir(faqDir);
  const faqItems: FAQItem[] = [];

  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = await readFile(join(faqDir, file), 'utf-8');
      const [frontmatter, ...answerParts] = content.split('---').filter(Boolean);
      const { question, category, sort } = parseFrontmatter(frontmatter.trim());
      const answer = answerParts.join('---').trim();

      faqItems.push({ question, answer, category, sort });
    }
  }

  // Sort the FAQ items based on the sort field
  faqItems.sort((a, b) => a.sort - b.sort);

  return {
    faqData: faqItems
  };
}