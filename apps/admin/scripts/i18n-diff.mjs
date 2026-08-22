#!/usr/bin/env node
/**
 * Dictionary completeness check for the admin console's i18n layer.
 *
 * `en.ts` is the source of truth. This script reports, per locale, which keys
 * are missing, which are extra (typos / renamed keys), and which are still
 * verbatim English — that last bucket is the one a reviewer actually needs,
 * because a copied English string type-checks perfectly and silently ships
 * untranslated UI.
 *
 * Deliberately a regex reader rather than an import: it runs without a build
 * step, and it works even while a dictionary is mid-edit and does not compile.
 *
 *   node scripts/i18n-diff.mjs            # summary
 *   node scripts/i18n-diff.mjs --list     # also print every offending key
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DICT_DIR = join(here, '..', 'src', 'lib', 'i18n', 'dictionaries');
const LOCALES = ['hi', 'kn'];
const listAll = process.argv.includes('--list');

function flag(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Pull `'key': 'value'` pairs out of a dictionary module.
 *
 * Handles the three shapes prettier produces: value on the same line, value
 * wrapped onto the next line, and single- vs double-quoted values. Escaped
 * quotes inside a value are respected so an apostrophe does not truncate it.
 */
function readDict(file) {
  const src = readFileSync(file, 'utf8');
  const entries = new Map();
  const re = /^[ \t]*'([^']+)':[ \t]*(?:\r?\n[ \t]*)?('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    entries.set(m[1], m[2].slice(1, -1));
  }
  return entries;
}

const en = readDict(join(DICT_DIR, 'en.ts'));

/**
 * `--todo <locale> [--ns a,b] --out <file>` writes a worklist: every key the
 * locale is missing, still carrying its English value, in dictionary syntax.
 * A translator (human or agent) overwrites the values in place and the file is
 * then concatenated into the real dictionary by `--merge`.
 */
const todoLocale = flag('--todo');
if (todoLocale) {
  const out = flag('--out');
  if (!out) {
    console.error('--todo requires --out <file>');
    process.exit(2);
  }
  let existing = new Map();
  try {
    existing = readDict(join(DICT_DIR, `${todoLocale}.ts`));
  } catch {
    /* no dictionary yet — every key is missing, which is the point */
  }
  const nsFilter = flag('--ns')?.split(',').map((s) => s.trim()).filter(Boolean);
  const wanted = [...en.entries()].filter(
    ([k]) =>
      !existing.has(k) && (!nsFilter || nsFilter.includes(k.split('.')[0])),
  );

  const lines = wanted.map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`);
  writeFileSync(
    out,
    `// ${wanted.length} keys awaiting ${todoLocale} translation.\n` +
      `// Replace ONLY the values. Keep every key, the order, and the trailing commas.\n` +
      `// Keep {placeholders} exactly as they are — they are interpolated at runtime.\n` +
      lines.join('\n') +
      '\n',
    'utf8',
  );
  console.log(`${out} — ${wanted.length} keys for ${todoLocale}`);
  process.exit(0);
}

/**
 * `--merge <locale> --from <file...>` folds finished worklists into the real
 * dictionary, keeping en.ts's key order and reporting anything still missing.
 */
const mergeLocale = flag('--merge');
if (mergeLocale) {
  const froms = process.argv.slice(process.argv.indexOf('--from') + 1).filter((a) => !a.startsWith('--'));
  if (froms.length === 0) {
    console.error('--merge requires --from <file> [file...]');
    process.exit(2);
  }
  const merged = new Map();
  try {
    for (const [k, v] of readDict(join(DICT_DIR, `${mergeLocale}.ts`))) merged.set(k, v);
  } catch {
    /* building the dictionary from scratch */
  }
  for (const f of froms) {
    for (const [k, v] of readDict(f)) {
      if (en.has(k)) merged.set(k, v);
    }
  }

  const NAMES = { hi: 'हिंदी — Hindi', kn: 'ಕನ್ನಡ — Kannada' };
  // Emit in en.ts order and re-print en.ts's own section comments, so the three
  // dictionaries stay readable side by side in review.
  const src = readFileSync(join(DICT_DIR, 'en.ts'), 'utf8');
  const body = [];
  const seen = new Set();
  for (const line of src.split(/\r?\n/)) {
    const comment = line.match(/^(\s*\/\/ .*)$/);
    if (comment && body.length > 0) {
      body.push('', comment[1]);
      continue;
    }
    const key = line.match(/^[ \t]*'([^']+)':/);
    if (!key || seen.has(key[1]) || !en.has(key[1])) continue;
    seen.add(key[1]);
    const value = merged.get(key[1]);
    body.push(`  '${key[1]}': ${JSON.stringify(value ?? en.get(key[1]))},`);
  }

  const missing = [...en.keys()].filter((k) => !merged.has(k));
  writeFileSync(
    join(DICT_DIR, `${mergeLocale}.ts`),
    `import type { Dictionary } from './en';\n\n` +
      `/**\n * ${NAMES[mergeLocale] ?? mergeLocale} dictionary for the Digital Pigmee admin console.\n *\n` +
      ` * Typed as \`Dictionary\`, so omitting any key in \`en.ts\` is a compile error.\n` +
      ` * Key order mirrors \`en.ts\`. Regenerate/verify with \`npm run i18n:check\`.\n */\n` +
      `export const ${mergeLocale}: Dictionary = {\n${body.join('\n')}\n};\n`,
    'utf8',
  );
  console.log(
    `${mergeLocale}.ts — ${merged.size}/${en.size} keys` +
      (missing.length ? ` · ${missing.length} still English-filled` : ' · complete'),
  );
  process.exit(0);
}

console.log(`en.ts — ${en.size} keys (source of truth)\n`);

let worstExit = 0;

for (const locale of LOCALES) {
  let dict;
  try {
    dict = readDict(join(DICT_DIR, `${locale}.ts`));
  } catch (err) {
    console.log(`${locale}.ts — MISSING (${err.code})`);
    worstExit = 1;
    continue;
  }

  const missing = [...en.keys()].filter((k) => !dict.has(k));
  const extra = [...dict.keys()].filter((k) => !en.has(k));
  // A value identical to English is either untranslated or a proper noun. Short
  // all-caps/numeric tokens (₹, EN, OTP) are legitimately identical, so ignore
  // anything without at least one lowercase letter to translate.
  const untranslated = [...dict.entries()].filter(
    ([k, v]) => en.get(k) === v && /[a-z]{2}/.test(v),
  );

  const ok = missing.length === 0 && extra.length === 0;
  if (!ok) worstExit = 1;

  console.log(
    `${locale}.ts — ${dict.size} keys · ${missing.length} missing · ${extra.length} extra · ${untranslated.length} still English`,
  );

  const show = (label, items) => {
    if (items.length === 0) return;
    const shown = listAll ? items : items.slice(0, 15);
    console.log(`  ${label}:`);
    for (const k of shown) console.log(`    ${k}`);
    if (shown.length < items.length) {
      console.log(`    … and ${items.length - shown.length} more (pass --list)`);
    }
  };

  show('missing', missing);
  show('extra (not in en.ts)', extra);
  show(
    'still English',
    untranslated.map(([k, v]) => `${k} = ${JSON.stringify(v.slice(0, 48))}`),
  );
  console.log('');
}

process.exit(worstExit);
