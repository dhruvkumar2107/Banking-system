/**
 * Waits for all three tiers to answer, prints a status table, then opens the two
 * browser-facing apps.
 *
 * The API is the slow one: `nest start --watch` typechecks the whole project
 * before it binds, which is why its budget is minutes and the others' is seconds.
 * Each target is polled independently so one slow tier does not mask another's
 * failure — a tier that never answers is reported by name.
 */
import { spawn } from 'node:child_process';

const TARGETS = [
  { name: 'API', url: 'http://127.0.0.1:4000/health', open: null, budgetMs: 240000 },
  { name: 'Admin', url: 'http://127.0.0.1:3001/login', open: 'http://localhost:3001/login', budgetMs: 180000 },
  { name: 'Customer', url: 'http://127.0.0.1:5000/', open: 'http://127.0.0.1:5000', budgetMs: 60000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function alive(url) {
  try {
    const ctl = AbortSignal.timeout(4000);
    const res = await fetch(url, { signal: ctl });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(t) {
  const deadline = Date.now() + t.budgetMs;
  while (Date.now() < deadline) {
    if (await alive(t.url)) return true;
    await sleep(1000);
  }
  return false;
}

console.log('\n  Starting Digital Pigmee — waiting for all three tiers.');
console.log('  The API compiles first, so this can take a minute or two.\n');

const results = await Promise.all(
  TARGETS.map(async (t) => {
    const up = await waitFor(t);
    console.log(`  [${up ? ' UP ' : 'DOWN'}]  ${t.name.padEnd(9)} ${t.url}`);
    return { ...t, up };
  }),
);

console.log('');
const down = results.filter((r) => !r.up);

if (down.length === 0) {
  console.log('  All three tiers are running.\n');
  console.log('  Admin     http://localhost:3001/login   (admin@pigmee.bank / Admin@12345)');
  console.log('  Customer  http://127.0.0.1:5000');
  console.log('  API       http://localhost:4000         (Swagger at /docs)\n');
  for (const r of results.filter((x) => x.open)) {
    spawn('cmd', ['/c', 'start', '', r.open], { detached: true, stdio: 'ignore' }).unref();
    await sleep(700); // let the browser settle before handing it a second URL
  }
  console.log('  Browser opened. Leave the three service windows open while you work.\n');
} else {
  console.log(`  ${down.length} tier(s) did not come up: ${down.map((d) => d.name).join(', ')}`);
  console.log('  Check that tier\'s own window for the error it printed.\n');
  process.exitCode = 1;
}
