import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', '.wrangler', 'node_modules', 'upload']);
const secretPattern = /(re_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|LEADS_EXPORT_TOKEN\s*=\s*\S+)/g;
const findings = [];

function scan(path) {
  if (ignored.has(path.split('/').at(-1))) return;
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) scan(join(path, entry));
    return;
  }
  if (path.endsWith('.env.example')) return;
  const contents = readFileSync(path, 'utf8');
  for (const match of contents.matchAll(secretPattern)) {
    const line = contents.slice(0, match.index).split('\n').length;
    findings.push(`${relative(root, path)}:${line}:${match[0]}`);
  }
}

scan(root);
if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}
