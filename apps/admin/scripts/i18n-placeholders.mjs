// Checks that every {placeholder} and the ₹ sign survive translation.
// Run from apps/admin:  node scripts/i18n-placeholders.mjs
import { readFileSync } from 'node:fs';

// Keys are always single-quoted; values may be single- or double-quoted.
const KV = /'((?:[^'\\]|\\.)*)':\s*\n?\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

function parse(file) {
  const src = readFileSync(`src/lib/i18n/dictionaries/${file}.ts`, 'utf8');
  const body = src.slice(src.indexOf('{'), src.lastIndexOf('}'));
  const out = {};
  let m;
  KV.lastIndex = 0;
  while ((m = KV.exec(body))) out[m[1]] = m[2] ?? m[3];
  return out;
}

const en = parse('en');
const locales = { hi: parse('hi'), kn: parse('kn') };
const placeholders = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join(',');
const rupeeKeys = Object.keys(en).filter((k) => en[k].includes('₹'));

let failed = 0;
for (const [name, dict] of Object.entries(locales)) {
  const bad = [];
  for (const key of Object.keys(en)) {
    if (!(key in dict)) continue;
    if (placeholders(en[key]) !== placeholders(dict[key])) {
      bad.push(`  ${key}\n    en: ${en[key]}\n    ${name}: ${dict[key]}`);
    }
  }
  const rupeeMissing = rupeeKeys.filter((k) => k in dict && !dict[k].includes('₹'));
  failed += bad.length + rupeeMissing.length;
  console.log(
    `${name}.ts — parsed ${Object.keys(dict).length} · ${bad.length} placeholder mismatch · ${rupeeMissing.length} missing ₹`,
  );
  if (bad.length) console.log(bad.join('\n'));
  if (rupeeMissing.length) console.log(`  missing ₹: ${rupeeMissing.join(', ')}`);
}

console.log(failed === 0 ? '\nAll placeholders and ₹ signs preserved.' : `\n${failed} problem(s).`);
process.exit(failed === 0 ? 0 : 1);
