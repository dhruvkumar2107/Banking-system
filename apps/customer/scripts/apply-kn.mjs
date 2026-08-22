#!/usr/bin/env node
/**
 * One-shot integration of the Kannada worklist into `lib/l10n/strings.dart`.
 *
 * Mechanical on purpose: the 203 Kannada values are spliced byte-for-byte out of
 * `scripts/todo-kn.dart.txt` rather than retyped, and the script refuses to write
 * anything unless the worklist's key set matches `_en` exactly. That check is the
 * whole point — `AppStrings.t()` falls back to English on a missing key, so a
 * typo'd or dropped key would silently ship an English string inside a Kannada
 * screen instead of failing loudly.
 *
 *   node scripts/apply-kn.mjs           # verify only
 *   node scripts/apply-kn.mjs --write   # verify, then patch strings.dart
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const STRINGS = join(here, '..', 'lib', 'l10n', 'strings.dart');
const TODO = join(here, 'todo-kn.dart.txt');
const write = process.argv.includes('--write');

const src = readFileSync(STRINGS, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';

/** Pull the `'key': 'value',` lines out of one `const Map ... _name = {...};` block. */
function mapBlock(text, name) {
  const start = text.indexOf(`const Map<String, String> _${name} = <String, String>{`);
  if (start === -1) throw new Error(`could not find the _${name} map`);
  const end = text.indexOf(`${eol}};`, start);
  if (end === -1) throw new Error(`could not find the end of _${name}`);
  return { start, end, body: text.slice(start, end) };
}

function keysOf(body) {
  return [...body.matchAll(/^[ \t]*'([^']+)':/gm)].map((m) => m[1]);
}

const enBlock = mapBlock(src, 'en');
const enKeys = keysOf(enBlock.body);

const todoSrc = readFileSync(TODO, 'utf8');
const knLines = todoSrc
  .split(/\r?\n/)
  .filter((l) => /^[ \t]*'([^']+)':/.test(l))
  .map((l) => l.trimEnd());
const knKeys = knLines.map((l) => l.match(/^[ \t]*'([^']+)':/)[1]);

// ── verification ──────────────────────────────────────────────────────────
const enSet = new Set(enKeys);
const knSet = new Set(knKeys);
const missing = enKeys.filter((k) => !knSet.has(k));
const extra = knKeys.filter((k) => !enSet.has(k));
const dupes = knKeys.filter((k, i) => knKeys.indexOf(k) !== i);
const outOfOrder = knKeys.length === enKeys.length && knKeys.some((k, i) => k !== enKeys[i]);

// A `{}` count mismatch is worse than a bad translation: `AppStrings.f()` fills
// placeholders positionally, so a dropped `{}` leaves a literal brace on screen
// and an extra one swallows the next argument.
const enValue = new Map(
  [...enBlock.body.matchAll(/^[ \t]*'([^']+)':[ \t]*'((?:[^'\\]|\\.)*)'/gm)].map((m) => [m[1], m[2]]),
);
const placeholderMismatch = [];
for (const line of knLines) {
  const m = line.match(/^[ \t]*'([^']+)':[ \t]*'((?:[^'\\]|\\.)*)'/);
  if (!m) continue;
  const en = enValue.get(m[1]);
  if (en === undefined) continue;
  const a = (en.match(/\{\}/g) ?? []).length;
  const b = (m[2].match(/\{\}/g) ?? []).length;
  if (a !== b) placeholderMismatch.push(`${m[1]} (en ${a} vs kn ${b})`);
}

// Every line must be a well-formed Dart entry, or the app will not compile.
const malformed = knLines.filter((l) => !/^[ \t]*'[^']+':[ \t]*'(?:[^'\\]|\\.)*',$/.test(l));

console.log(`_en: ${enKeys.length} keys · todo-kn: ${knKeys.length} entries`);
const problems = [
  ['missing from kn', missing],
  ['not in _en', extra],
  ['duplicated in kn', dupes],
  ['placeholder count differs', placeholderMismatch],
  ['malformed line', malformed],
];
let bad = false;
for (const [label, items] of problems) {
  if (items.length === 0) continue;
  bad = true;
  console.error(`  ✗ ${items.length} ${label}: ${items.slice(0, 8).join(', ')}${items.length > 8 ? ' …' : ''}`);
}
if (outOfOrder) console.warn('  ! kn key order differs from _en (cosmetic; splicing in _en order)');
if (bad) {
  console.error('\nRefusing to patch strings.dart.');
  process.exit(1);
}
console.log('  ✓ key sets match, placeholders line up, every line parses');

if (!write) {
  console.log('\nVerify-only run. Pass --write to patch strings.dart.');
  process.exit(0);
}

// ── patch ─────────────────────────────────────────────────────────────────
const byKey = new Map(knLines.map((l) => [l.match(/^[ \t]*'([^']+)':/)[1], l]));
let out = src;

/** Add a Kannada entry to the language-picker labels in every dictionary. */
const HINDI_LINE = /^([ \t]*)'hindi':[ \t]*'[^']*',$/gm;
out = out.replace(HINDI_LINE, (line, indent) => `${line}${eol}${indent}'kannada': 'ಕನ್ನಡ',`);

// Emit `_kn` in _en's order, carrying _en's own section comments across so the
// three maps stay readable side by side in review.
const knBody = [];
for (const line of enBlock.body.split(/\r?\n/)) {
  const comment = line.match(/^([ \t]*\/\/ .*)$/);
  if (comment) {
    knBody.push(comment[1]);
    continue;
  }
  const key = line.match(/^[ \t]*'([^']+)':/);
  if (!key) continue;
  if (key[1] === 'hindi') {
    knBody.push(byKey.get('hindi'), `  'kannada': 'ಕನ್ನಡ',`);
    continue;
  }
  const entry = byKey.get(key[1]);
  if (entry) knBody.push(entry);
}

out =
  out.trimEnd() +
  eol +
  eol +
  '/// ಕನ್ನಡ — Kannada. Plain spoken register a village saver reads on a phone,' +
  eol +
  '/// not literary Kannada. Key order and section comments mirror `_en`.' +
  eol +
  'const Map<String, String> _kn = <String, String>{' +
  eol +
  knBody.join(eol) +
  eol +
  '};' +
  eol;

// Register the locale in the three places that gate it.
const before = out;
out = out.replace(
  `  static const List<Locale> supported = <Locale>[Locale('en'), Locale('hi')];`,
  `  static const List<Locale> supported = <Locale>[Locale('en'), Locale('hi'), Locale('kn')];`,
);
out = out.replace(`    'hi': _hi,${eol}  };`, `    'hi': _hi,${eol}    'kn': _kn,${eol}  };`);
if (out === before) {
  console.error('✗ neither `supported` nor `_values` matched — strings.dart has changed shape.');
  process.exit(1);
}

writeFileSync(STRINGS, out, 'utf8');
console.log(`\n✓ strings.dart patched — _kn added with ${knBody.filter((l) => !l.trimStart().startsWith('//')).length} entries`);
console.log("  ✓ 'kn' registered in AppStrings.supported and _values");
console.log("  ✓ 'kannada' label added to _en, _hi and _kn");
