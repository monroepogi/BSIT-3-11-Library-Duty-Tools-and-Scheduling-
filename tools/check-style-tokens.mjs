import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, normalize } from 'node:path';

/**
 * Enforces design token rules:
 * Component styles (.scss and inline styles in .ts) consume CSS custom properties (--vits-*) only.
 * No hard-coded hex colors, rgb/hsl literals, or raw font-size/border-radius px/rem values
 * are permitted outside libs/shared-ui/styles/ and apps/<app>/src/global.scss.
 */
const ROOT = process.cwd();
const ALLOWED_TOKEN_DIRS = [normalize('libs/shared-ui/styles')];
const ALLOWED_ENTRY_FILES = new Set([
  normalize('apps/mobile/src/global.scss'),
  normalize('apps/admin/src/global.scss'),
]);

function walkFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === '.angular' ||
      entry === 'android' ||
      entry === '.git' ||
      entry === 'coverage'
    ) {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(fullPath, results);
    } else if (entry.endsWith('.scss') || (entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))) {
      results.push(fullPath);
    }
  }
  return results;
}

function inspectCssLines(relPath, cssText, baseLineOffset, violations) {
  const lines = cssText.split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith('/*') || line.startsWith('*')) return;

    const lineNum = baseLineOffset + idx + 1;
    if (/#[0-9a-fA-F]{3,8}\b/.test(line) || /\brgba?\s*\(/.test(line) || /\bhsla?\s*\(/.test(line)) {
      violations.push(`${relPath}:${lineNum}: Hard-coded color literal forbidden -> "${line}"`);
    }
    if (/^\s*font-size\s*:(?!\s*(?:var\(|inherit|unset|initial))/.test(line)) {
      violations.push(`${relPath}:${lineNum}: Hard-coded font-size forbidden; use var(--vits-text-*) -> "${line}"`);
    }
    if (/^\s*border-radius\s*:(?!\s*(?:var\(|0\b|inherit|unset))/.test(line)) {
      violations.push(`${relPath}:${lineNum}: Hard-coded border-radius forbidden; use var(--vits-radius-*) -> "${line}"`);
    }
  });
}

const violations = [];
for (const file of walkFiles(ROOT)) {
  const rel = normalize(relative(ROOT, file));
  if (ALLOWED_ENTRY_FILES.has(rel) || ALLOWED_TOKEN_DIRS.some((d) => rel.startsWith(d))) {
    continue;
  }

  const content = readFileSync(file, 'utf8');
  if (file.endsWith('.scss')) {
    inspectCssLines(rel, content, 0, violations);
  } else if (file.endsWith('.ts')) {
    const styleBlockRegex = /\bstyles\s*:\s*`([\s\S]*?)`/g;
    let match;
    while ((match = styleBlockRegex.exec(content)) !== null) {
      const prefixLines = content.slice(0, match.index).split(/\r?\n/).length - 1;
      inspectCssLines(rel, match[1], prefixLines, violations);
    }
  }
}

if (violations.length > 0) {
  console.error('Design Token SCSS Check Failed:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('Design Token SCSS Check Passed (0 component token violations across SCSS and inline TS styles).');
