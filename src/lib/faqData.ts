import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function findFaqDir(): string | null {
  const possiblePaths = [
    join(process.cwd(), 'src', 'content', 'faq'),
    join(__dirname, '..', '..', 'src', 'content', 'faq'),
    join(__dirname, '..', 'content', 'faq'),
    join(__dirname, 'content', 'faq')
  ];

  for (const path of possiblePaths) {
    console.log(`Checking path: ${path}`);
    if (existsSync(path)) {
      console.log(`Found FAQ directory at: ${path}`);
      return path;
    }
  }

  console.error('FAQ directory not found in any of the checked locations');
  return null;
}

const faqDir = findFaqDir();
const faqItems: FAQItem[] = [];

if (faqDir) {
  const files = readdirSync(faqDir);

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
} else {
  console.error('FAQ directory not found');
}

export const faqData = faqItems;