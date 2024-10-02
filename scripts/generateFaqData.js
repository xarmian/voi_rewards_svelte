import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function parseFrontmatter(frontmatter) {
  const lines = frontmatter.split('\n');
  const result = {};

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':').map(part => part.trim());
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim();
      if (key === 'sort') {
        result[key] = parseInt(value, 10);
      } else {
        result[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return result;
}

const faqDir = join(process.cwd(), 'static', 'content', 'faq');
const files = readdirSync(faqDir);
const faqItems = [];

for (const file of files) {
  if (file.endsWith('.md')) {
    const content = readFileSync(join(faqDir, file), 'utf-8');
    const [frontmatter, ...answerParts] = content.split('---').filter(Boolean);
    const { question, category, sort } = parseFrontmatter(frontmatter.trim());
    const answer = answerParts.join('---').trim();

    faqItems.push({ question, answer, category, sort });
  }
}

writeFileSync(join(process.cwd(), 'src', 'lib', 'faqData.json'), JSON.stringify(faqItems, null, 2));
console.log('FAQ data generated successfully');