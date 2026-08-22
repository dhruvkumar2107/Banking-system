// Reports every t('…') / labelKey / TranslationKey literal used in src/ that is
// missing from en.ts, and every dictionary key nothing references.
// Run from apps/admin:  node scripts/i18n-usage.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const enSrc = readFileSync('src/lib/i18n/dictionaries/en.ts', 'utf8');
const known = new Set(
  [...enSrc.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]),
);
// Only treat a dotted literal as a translation key if its namespace is one we own.
const NAMESPACES = new Set([...known].map((k) => k.split('.')[0]));

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !p.includes(join('lib', 'i18n'))) out.push(p);
  }
  return out;
}

// t('key'), t("key"), and bare 'namespace.key' literals in TranslationKey maps.
const CALL = /\bt\(\s*['"]([A-Za-z][\w]*(?:\.[\w]+)+)['"]/g;
const MAP = /['"]([A-Za-z][\w]*\.[\w.]+)['"]\s*(?:,|;|\})/g;

const missing = new Map();
const used = new Set();

for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  const hits = [
    ...[...src.matchAll(CALL)].map((m) => m[1]),
    // only scan map literals in files that import from the i18n barrel
    ...(src.includes("@/lib/i18n") ? [...src.matchAll(MAP)].map((m) => m[1]) : []),
  ];
  for (const key of hits) {
    // Skip things that merely look like keys (paths, packages, mime types).
    if (/^https?|^@|\//.test(key)) continue;
    const ns = key.split('.')[0];
    if (!NAMESPACES.has(ns)) continue;
    used.add(key);
    if (!known.has(key)) {
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(file);
    }
  }
}

console.log(`en.ts knows ${known.size} keys · src references ${used.size} of them`);

if (missing.size === 0) {
  console.log('\nNo missing keys. Every t() call resolves.');
} else {
  console.log(`\n${missing.size} MISSING key(s):`);
  for (const [key, files] of [...missing].sort()) {
    console.log(`  ${key}\n      ${[...files].join('\n      ')}`);
  }
}

const unused = [...known].filter((k) => !used.has(k));
console.log(`\n${unused.length} dictionary key(s) not referenced anywhere in src/.`);
if (process.argv.includes('--unused')) console.log(unused.map((k) => `  ${k}`).join('\n'));

// Per-namespace wiring report: which screens are actually translated yet.
if (process.argv.includes('--by-namespace')) {
  const by = {};
  for (const key of known) {
    const ns = key.split('.')[0];
    by[ns] ??= { total: 0, wired: 0 };
    by[ns].total += 1;
    if (used.has(key)) by[ns].wired += 1;
  }
  console.log('\nnamespace          keys  wired  coverage');
  for (const [ns, { total, wired }] of Object.entries(by).sort((a, b) => b[1].total - a[1].total)) {
    const pct = wired === 0 ? 'none' : wired === total ? 'all' : `${Math.round((100 * wired) / total)}%`;
    console.log(ns.padEnd(18) + String(total).padStart(4) + String(wired).padStart(7) + '  ' + pct);
  }
}

process.exit(missing.size === 0 ? 0 : 1);
