/**
 * Wiring audit — proves the three tiers actually line up.
 *
 * Extracts:
 *   1. every route the API exposes (NestJS @Controller + method decorators)
 *   2. every path the admin panel calls (api.get/post/patch/put/del)
 *   3. every path the Flutter app calls (_api.get/post/patch/put/delete)
 *
 * Then reports calls with no matching route (broken wiring) and routes nobody
 * calls (built but unreached). Path params normalise to ":p" so
 * `/customers/${id}` matches `@Get(':id')`.
 *
 * Run: node scripts/wiring-audit.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, test, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
}

const norm = (s) =>
  '/' +
  s
    .split('/')
    .filter(Boolean)
    .map((seg) =>
      seg.startsWith(':') || seg.startsWith('$') || seg.includes('${') ? ':p' : seg,
    )
    .join('/');

/**
 * Find `receiver.verb(...)` calls and pull out the first string-literal argument,
 * tolerating generics and newlines between the call and its first argument.
 */
function extractCalls(src, receiverRe, verbs) {
  const found = [];
  const re = new RegExp(`\\b(?:${receiverRe})\\.(${verbs.join('|')})\\b`, 'g');
  for (const m of src.matchAll(re)) {
    let i = m.index + m[0].length;
    // skip generics <Foo, Bar>
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] === '<') {
      let depth = 0;
      while (i < src.length) {
        if (src[i] === '<') depth++;
        else if (src[i] === '>' && --depth === 0) { i++; break; }
        i++;
      }
    }
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '(') continue;
    i++;
    while (i < src.length && /\s/.test(src[i])) i++;
    const q = src[i];
    if (q !== "'" && q !== '"' && q !== '`') continue;
    let j = i + 1;
    while (j < src.length && src[j] !== q) j++;
    found.push([m[1], src.slice(i + 1, j)]);
  }
  return found;
}

// ── 1. API routes (handles MULTIPLE @Controller blocks per file) ─────────────
const routes = new Map();
for (const f of walk(join(ROOT, 'apps/api/src'), (p) => p.endsWith('.controller.ts'))) {
  const src = readFileSync(f, 'utf8');
  const chunks = src.split(/(?=@Controller\()/).slice(1);
  for (const chunk of chunks) {
    const base = chunk.match(/@Controller\(\s*['"]([^'"]*)['"]/)?.[1] ?? '';
    for (const m of chunk.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:['"]([^'"]*)['"])?/g)) {
      const key = `${m[1].toUpperCase()} ${norm(`${base}/${m[2] ?? ''}`)}`;
      if (!routes.has(key)) routes.set(key, f.replace(ROOT, ''));
    }
  }
}

// Wrapper methods on each client → the HTTP verb they actually issue.
const ADMIN_VERBS = {
  get: 'GET',
  post: 'POST',
  postPublic: 'POST',
  patch: 'PATCH',
  put: 'PUT',
  del: 'DELETE',
  delete: 'DELETE',
  blob: 'GET',
};
const FLUTTER_VERBS = {
  get: 'GET',
  getJson: 'GET',
  getJsonOrNull: 'GET',
  getList: 'GET',
  getBytes: 'GET',
  post: 'POST',
  postFile: 'POST',
  patch: 'PATCH',
  put: 'PUT',
  delete: 'DELETE',
};

// ── 2. admin calls ───────────────────────────────────────────────────────────
const adminCalls = new Map();
for (const f of walk(join(ROOT, 'apps/admin/src'), (p) => /\.tsx?$/.test(p))) {
  for (const [verb, path] of extractCalls(
    readFileSync(f, 'utf8'),
    'api',
    Object.keys(ADMIN_VERBS),
  )) {
    if (!path.startsWith('/')) continue;
    const key = `${ADMIN_VERBS[verb]} ${norm(path)}`;
    if (!adminCalls.has(key)) adminCalls.set(key, f.replace(ROOT, ''));
  }
}
// The token refresh is issued by the raw fetch layer in api.ts, not via api.post.
for (const f of walk(join(ROOT, 'apps/admin/src'), (p) => /\.tsx?$/.test(p))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/fetch\(\s*`\$\{BASE_URL\}(\/[a-z/-]+)`/g)) {
    const key = `POST ${norm(m[1])}`;
    if (!adminCalls.has(key)) adminCalls.set(key, `${f.replace(ROOT, '')} (fetch layer)`);
  }
}

// ── 3. flutter calls ─────────────────────────────────────────────────────────
const flutterCalls = new Map();
for (const f of walk(join(ROOT, 'apps/customer/lib'), (p) => p.endsWith('.dart'))) {
  for (const [verb, path] of extractCalls(
    readFileSync(f, 'utf8'),
    '_api|_client|api|client',
    Object.keys(FLUTTER_VERBS),
  )) {
    if (!path.startsWith('/')) continue;
    const key = `${FLUTTER_VERBS[verb]} ${norm(path)}`;
    if (!flutterCalls.has(key)) flutterCalls.set(key, f.replace(ROOT, ''));
  }
}

// ── dynamic-path allowance ───────────────────────────────────────────────────
// `api.post(`/withdrawals/${id}/${action}`)` where action is approve|reject|pay
// normalises to POST /withdrawals/:p/:p — it legitimately covers several routes.
const wildcardCovers = (call, route) => {
  const [cv, cp] = call.split(' ');
  const [rv, rp] = route.split(' ');
  if (cv !== rv) return false;
  const c = cp.split('/');
  const r = rp.split('/');
  if (c.length !== r.length) return false;
  return c.every((seg, i) => seg === r[i] || seg === ':p');
};

const allCalls = [...adminCalls.keys(), ...flutterCalls.keys()];
const resolves = (k) => routes.has(k) || [...routes.keys()].some((r) => wildcardCovers(k, r));
const isCalled = (r) => allCalls.some((c) => c === r || wildcardCovers(c, r));

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
console.log(`API routes exposed      : ${routes.size}`);
console.log(`Admin panel call sites  : ${adminCalls.size}`);
console.log(`Flutter app call sites  : ${flutterCalls.size}`);

let broken = 0;
for (const [label, calls] of [['ADMIN', adminCalls], ['FLUTTER', flutterCalls]]) {
  const bad = [...calls].filter(([k]) => !resolves(k));
  if (bad.length) {
    console.log(`\n[X] ${label} calls with NO matching API route (${bad.length}):`);
    for (const [k, f] of bad) console.log(`    ${pad(k, 44)} ${f}`);
    broken += bad.length;
  } else {
    console.log(`\n[OK] ${label}: all ${calls.size} calls resolve to real API routes.`);
  }
}

const unused = [...routes].filter(([k]) => !isCalled(k));
if (unused.length) {
  console.log(`\n[!] API routes not called by admin or app (${unused.length}) — built but unreached:`);
  for (const [k, f] of unused) console.log(`    ${pad(k, 44)} ${f}`);
}

console.log(
  `\n${broken === 0 ? 'PASS' : 'FAIL'} — ${broken} broken call(s), ${unused.length} unreached route(s).`,
);
