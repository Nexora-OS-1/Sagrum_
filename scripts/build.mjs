import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src');
const outputDir = path.join(root, 'dist');

await mkdir(outputDir, { recursive: true });
await cp(path.join(root, 'style'), path.join(outputDir, 'style'), { recursive: true });
await cp(path.join(root, 'scripts'), path.join(outputDir, 'scripts'), { recursive: true });
await cp(path.join(root, 'Logo'), path.join(outputDir, 'Logo'), { recursive: true });

const routes = {
  'index.html': '',
  'info.html': 'info',
  'portfolio.html': 'portfolio',
  'clips.html': 'clips',
  'contact.html': 'contact',
  'payments.html': 'payments',
  'admin.html': 'admin'
};

for (const [filename, route] of Object.entries(routes)) {
  const page = await readFile(path.join(sourceDir, filename));
  await writeFile(path.join(outputDir, filename), page);
  if (route) {
    const routeDir = path.join(outputDir, route);
    await mkdir(routeDir, { recursive: true });
    await writeFile(path.join(routeDir, 'index.html'), page);
  }
}

await writeFile(path.join(outputDir, '.nojekyll'), '');
console.log('Static site built in dist/.');
