#!/usr/bin/env node
/**
 * Folds the `newkeys-*.ts` harvest fragments into `en.ts`, each key landing in
 * the section its namespace already owns.
 *
 * Why a script and not hand-editing: the fragments carry ~150 keys written by
 * separate agents, and `i18n-diff.mjs --merge` silently DROPS any key that is
 * not already in `en.ts` (`if (en.has(k))`). A key fumbled here would therefore
 * vanish from hi.ts/kn.ts without any error, and the page would render the raw
 * key string. So this refuses to write on the first sign of trouble instead.
 *
 * Value literals are spliced byte-for-byte out of the fragments rather than
 * re-quoted, so no escape or non-ASCII character can be mangled in transit.
 *
 *   node scripts/merge-newkeys.mjs            # report only
 *   node scripts/merge-newkeys.mjs --write    # patch en.ts, delete fragments
 */
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const EN = join(here, '..', 'src', 'lib', 'i18n', 'dictionaries', 'en.ts');
const write = process.argv.includes('--write');

const src = readFileSync(EN, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const lines = src.split(/\r?\n/);

/** `  // ── loans ────────` opens a section; `  // notices` does not. */
const SECTION = /^\s*\/\/ ── ([A-Za-z]+)\b/;
/** A fragment comment that only repeats a section name we already have. */
const BARE_SECTION = /^\s*\/\/ ── [A-Za-z]+ *─*\s*$/;
const KEY_START = /^[ \t]*'([^']+)':[ \t]*(.*)$/;

// ── read en.ts: existing keys, and where each section ends ──────────────────
const existing = new Map(); // key -> raw literal
const valueOwner = new Map(); // literal -> first key using it
{
  const re = /^[ \t]*'([^']+)':[ \t]*(?:\r?\n[ \t]*)?('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/gm;
  for (const m of src.matchAll(re)) {
    existing.set(m[1], m[2]);
    if (!valueOwner.has(m[2])) valueOwner.set(m[2], m[1]);
  }
}

/** Index of the section header for `ns`, or -1. */
const sectionStart = (ns) => lines.findIndex((l) => SECTION.exec(l)?.[1] === ns);

/** Last line of that section's key block — insert here, after trailing blanks. */
function sectionEnd(from) {
  let j = from + 1;
  while (j < lines.length && !SECTION.test(lines[j]) && !/^\};/.test(lines[j])) j++;
  while (j > from && lines[j - 1].trim() === '') j--; // don't land after the blank
  return j;
}

// ── read the fragments ─────────────────────────────────────────────────────
const fragments = readdirSync(here)
  .filter((f) => /^newkeys-.*\.ts$/.test(f))
  .sort();
if (fragments.length === 0) {
  console.error('No scripts/newkeys-*.ts fragments found — nothing to merge.');
  process.exit(2);
}

const problems = [];
const warnings = [];
const seen = new Map(); // key -> fragment that first defined it
/** ns -> array of output lines to append to that section */
const additions = new Map();
let total = 0;

for (const file of fragments) {
  const text = readFileSync(join(here, file), 'utf8');
  const flines = text.split(/\r?\n/);
  let comments = [];
  let anyKeyYet = false;
  let inBlockComment = false;

  for (let i = 0; i < flines.length; i++) {
    const line = flines[i];
    if (line.trim() === '') continue;

    // `/** … */` file headers explain the harvest to me, not to translators.
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (/^\s*\/\*/.test(line)) {
      if (!line.includes('*/')) inBlockComment = true;
      continue;
    }

    if (/^\s*\/\//.test(line)) {
      // Header banter above the first key, and comments that only repeat a
      // section name, are the fragment's own scaffolding — not documentation.
      if (anyKeyYet && !BARE_SECTION.test(line)) comments.push(`  ${line.trim()}`);
      continue;
    }

    const m = KEY_START.exec(line);
    if (!m) {
      problems.push(`${file}:${i + 1} is neither a comment nor a key: ${line.trim()}`);
      continue;
    }
    anyKeyYet = true;
    const key = m[1];

    // The literal is on this line, or wrapped onto the following one.
    let literal = m[2].replace(/,\s*$/, '');
    if (literal === '') {
      const next = flines[++i] ?? '';
      literal = next.trim().replace(/,\s*$/, '');
    }
    if (!/^'(?:[^'\\]|\\.)*'$|^"(?:[^"\\]|\\.)*"$/.test(literal)) {
      problems.push(`${file}:${i + 1} value is not a single quoted literal: ${literal.slice(0, 60)}`);
      comments = [];
      continue;
    }

    // A key that landed in en.ts directly while the fragments were being written
    // is authoritative — it is already translated in hi.ts/kn.ts. Keep that one
    // and say so, loudly if the fragment disagreed about the wording.
    if (existing.has(key)) {
      const mine = existing.get(key);
      warnings.push(
        mine === literal
          ? `${key} already in en.ts with the same value — fragment copy dropped`
          : `${key} already in en.ts as ${mine} — KEEPING that, dropping ${literal}`,
      );
      comments = [];
      continue;
    }
    if (seen.has(key)) {
      problems.push(`${key} defined twice: ${seen.get(key)} and ${file}`);
      comments = [];
      continue;
    }
    seen.set(key, file);

    const ns = key.split('.')[0];
    if (sectionStart(ns) === -1) {
      problems.push(`${key} (${file}) — en.ts has no "── ${ns} ──" section`);
      comments = [];
      continue;
    }

    // Duplicate English is a smell, not a blocker: two pages may legitimately
    // want the same word under different keys so translators can diverge.
    const clash = valueOwner.get(literal);
    if (clash) warnings.push(`${key} repeats the value of ${clash}`);

    const out = additions.get(ns) ?? [];
    if (out.length === 0) out.push('');
    out.push(...comments);
    // Match en.ts: wrap onto a continuation line rather than run long.
    const oneLine = `  '${key}': ${literal},`;
    out.push(oneLine.length <= 100 ? oneLine : `  '${key}':${eol}    ${literal},`);
    additions.set(ns, out);
    comments = [];
    total++;
  }
}

// ── report ─────────────────────────────────────────────────────────────────
console.log(`en.ts — ${existing.size} keys · ${fragments.length} fragments · ${total} new keys`);
for (const [ns, out] of additions) {
  console.log(`  ${ns}: +${out.filter((l) => /^\s*'/.test(l)).length}`);
}
if (warnings.length) {
  console.log(`\n${warnings.length} duplicate-value warning(s):`);
  for (const w of warnings.slice(0, 12)) console.log(`  ! ${w}`);
  if (warnings.length > 12) console.log(`  … and ${warnings.length - 12} more`);
}
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
  if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
  console.error('\nRefusing to patch en.ts.');
  process.exit(1);
}
console.log('  ✓ every key is new, well-formed, and has a section to live in');

if (!write) {
  console.log('\nReport-only run. Pass --write to patch en.ts.');
  process.exit(0);
}

// ── patch, bottom-up so earlier indices stay valid ──────────────────────────
const inserts = [...additions.entries()]
  .map(([ns, out]) => ({ at: sectionEnd(sectionStart(ns)), out }))
  .sort((a, b) => b.at - a.at);
for (const { at, out } of inserts) lines.splice(at, 0, ...out);

writeFileSync(EN, lines.join(eol), 'utf8');
console.log(`\n✓ en.ts patched — ${existing.size} → ${existing.size + total} keys`);

for (const f of fragments) unlinkSync(join(here, f));
console.log(`✓ ${fragments.length} fragment(s) consumed and removed`);
console.log('\nNext: npx tsc --noEmit  (hi/kn are typed Dictionary — they will fail until translated)');
console.log('      node scripts/i18n-diff.mjs --todo hi --out scripts/todo-hi.ts');
console.log('      node scripts/i18n-diff.mjs --todo kn --out scripts/todo-kn.ts');
