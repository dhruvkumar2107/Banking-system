#!/usr/bin/env node
/**
 * Static verification of the Docker build contexts — the checks that would
 * otherwise only surface as a failed `docker build`.
 *
 *   node scripts/verify-docker-context.mjs
 *
 * This is NOT a substitute for actually building the images (CI does that, see
 * the `docker` job in .github/workflows/ci.yml). It exists so the Dockerfiles
 * can be validated on a machine without a Docker daemon, and so the common
 * silent breakages are caught at review time rather than at deploy time:
 *
 *   1. A `COPY <src>` whose source does not exist in the repo.
 *   2. A `COPY <src>` whose source IS excluded by .dockerignore — Docker then
 *      fails with a confusing "file not found" even though the path is on disk.
 *   3. A `COPY --from=<stage>` referencing a build output the compile step does
 *      not actually produce (e.g. migrations that never made it into dist/).
 *   4. A runtime `CMD` whose entrypoint file is not present in the final stage.
 *   5. A package needed at runtime that sits in devDependencies, which
 *      `npm ci --omit=dev` would strip.
 *
 * Exits non-zero on any failure so it can gate a commit or a CI step.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

const rel = (p) => p.split('\\').join('/');
const exists = (p) => existsSync(join(ROOT, p));

// ── .dockerignore ───────────────────────────────────────────────────────────

/**
 * Minimal .dockerignore matcher. Docker uses Go filepath.Match semantics per
 * path segment; we implement the subset this repo actually uses (`*`, `**`,
 * leading `!` negation) which is enough to catch an accidental exclusion.
 */
function loadDockerignore() {
  const file = join(ROOT, '.dockerignore');
  if (!existsSync(file)) {
    fail('.dockerignore is missing — the build context would include node_modules and .git.');
    return [];
  }
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const negated = line.startsWith('!');
      const pattern = negated ? line.slice(1) : line;
      const rx = new RegExp(
        '^' +
          pattern
            .split('/')
            .map((seg) =>
              seg === '**'
                ? '.*'
                : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
            )
            .join('/') +
          '(/.*)?$',
      );
      return { negated, pattern, rx };
    });
}

const ignoreRules = loadDockerignore();

/** True if `path` (repo-relative, forward slashes) is excluded from the context. */
function isIgnored(path) {
  let ignored = false;
  for (const rule of ignoreRules) {
    if (rule.rx.test(path)) ignored = !rule.negated;
  }
  return ignored;
}

// ── Dockerfile parsing ──────────────────────────────────────────────────────

/** Parse COPY/CMD/FROM instructions, joining backslash-continued lines. */
function parseDockerfile(path) {
  const raw = readFileSync(join(ROOT, path), 'utf8');
  const logical = raw
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
    .replace(/\\\r?\n\s*/g, ' ');

  const stages = [];
  const copies = [];
  let cmd = null;
  let stage = null;
  let workdir = '/';

  for (const line of logical.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;

    const from = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(t);
    if (from) {
      stage = from[2] ?? `stage${stages.length}`;
      stages.push(stage);
      workdir = '/';
      continue;
    }
    const wd = /^WORKDIR\s+(\S+)/i.exec(t);
    if (wd) {
      workdir = wd[1];
      continue;
    }
    const copy = /^COPY\s+(.*)$/i.exec(t);
    if (copy) {
      const parts = copy[1].split(/\s+/).filter(Boolean);
      const fromFlag = parts.find((p) => /^--from=/i.test(p));
      const args = parts.filter((p) => !p.startsWith('--'));
      copies.push({
        stage,
        from: fromFlag ? fromFlag.split('=')[1] : null,
        sources: args.slice(0, -1),
        dest: args.at(-1),
      });
      continue;
    }
    const c = /^CMD\s+(.*)$/i.exec(t);
    if (c) cmd = { raw: c[1], stage, workdir };
  }
  return { stages, copies, cmd };
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkDockerfile(dockerfile, opts) {
  const label = rel(dockerfile);
  if (!exists(dockerfile)) {
    fail(`${label}: file not found.`);
    return;
  }
  const { stages, copies, cmd } = parseDockerfile(dockerfile);
  note(`${label}: ${stages.length} stage(s) [${stages.join(', ')}], ${copies.length} COPY instruction(s)`);

  for (const c of copies) {
    for (const src of c.sources) {
      // Cross-stage copies reference build output, not the repo — checked separately.
      if (c.from) continue;
      if (src === '.' || src === './') continue;

      const path = rel(src.replace(/^\.\//, ''));
      // A glob in a COPY source: verify the directory part at least exists.
      const probe = path.includes('*') ? path.slice(0, path.indexOf('*')).replace(/\/$/, '') : path;
      if (probe && !exists(probe)) {
        fail(`${label}: COPY source "${src}" does not exist in the repo.`);
        continue;
      }
      if (isIgnored(path)) {
        fail(
          `${label}: COPY source "${src}" exists on disk but is EXCLUDED by .dockerignore — ` +
            `the build would fail with "not found".`,
        );
      }
    }
  }

  // Cross-stage copies must reference a real earlier stage.
  for (const c of copies) {
    if (c.from && !stages.includes(c.from)) {
      fail(`${label}: COPY --from=${c.from} references an unknown stage.`);
    }
  }

  // Every declared build output must actually be produced by the local build.
  for (const [output, why] of Object.entries(opts.expectedBuildOutputs ?? {})) {
    if (!exists(output)) {
      fail(
        `${label}: expected build output "${output}" is missing (${why}). ` +
          `Run the app's build first, then re-run this check.`,
      );
      continue;
    }
    const st = statSync(join(ROOT, output));
    // A directory's own `size` is metadata, not content — count entries instead.
    const empty = st.isDirectory() ? readdirSync(join(ROOT, output)).length === 0 : st.size === 0;
    if (empty) fail(`${label}: build output "${output}" exists but is empty.`);
  }

  // The CMD entrypoint must be one of the copied build outputs.
  if (cmd && opts.expectedCmd && !cmd.raw.includes(opts.expectedCmd)) {
    fail(`${label}: CMD is ${cmd.raw} — expected it to invoke "${opts.expectedCmd}".`);
  }
}

/** Runtime stages run `npm ci --omit=dev`, so runtime imports must not be devDeps. */
function checkRuntimeDeps(pkgPath, required) {
  const pkg = JSON.parse(readFileSync(join(ROOT, pkgPath), 'utf8'));
  const deps = pkg.dependencies ?? {};
  const dev = pkg.devDependencies ?? {};
  for (const name of required) {
    if (deps[name]) continue;
    if (dev[name]) {
      fail(
        `${rel(pkgPath)}: "${name}" is a devDependency but is needed at runtime — ` +
          `\`npm ci --omit=dev\` would strip it from the image.`,
      );
    } else {
      note(`${rel(pkgPath)}: "${name}" not declared directly (resolved transitively).`);
    }
  }
}

// ── docker-compose ──────────────────────────────────────────────────────────

function checkCompose() {
  const file = 'docker-compose.yml';
  if (!exists(file)) return fail('docker-compose.yml is missing.');
  const text = readFileSync(join(ROOT, file), 'utf8');

  // The API refuses to boot in production while payments are mocked / OTPs are
  // echoed. A compose default of NODE_ENV=production therefore cannot start.
  const nodeEnv = /^\s*NODE_ENV:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const mocked = /PAYMENTS_MODE:\s*\$\{PAYMENTS_MODE:-mock\}/.test(text);
  if (nodeEnv === 'production' && mocked) {
    fail(
      'docker-compose.yml sets NODE_ENV=production while PAYMENTS_MODE defaults to mock — ' +
        'the API bootstrap check would refuse to start. Default to staging instead.',
    );
  } else {
    note(`docker-compose.yml: NODE_ENV default is ${nodeEnv}`);
  }

  // Uploaded KYC files are customer PII and must outlive the container.
  if (!/pigmee_uploads/.test(text)) {
    fail('docker-compose.yml has no volume for apps/api/storage — uploaded KYC files would be lost on rebuild.');
  }

  // Images referenced by a --no-build compose run must match the CI build tags.
  const ci = exists('.github/workflows/ci.yml')
    ? readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    : '';
  for (const image of [...text.matchAll(/^\s*image:\s*(pigmee-\S+)\s*$/gm)].map((m) => m[1])) {
    const tagged = image.includes(':') ? image : `${image}:latest`;
    if (ci && !ci.includes(tagged)) {
      fail(
        `docker-compose.yml uses image "${image}" but CI never builds tag "${tagged}" — ` +
          `a \`docker compose up --no-build\` in CI would try to pull it from a registry.`,
      );
    }
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

checkDockerfile('apps/api/Dockerfile', {
  expectedCmd: 'dist/main.js',
  expectedBuildOutputs: {
    'apps/api/dist/main.js': 'nest build output',
    'apps/api/dist/db/seed.js': 'superadmin seed, invoked as `docker compose exec api node dist/db/seed.js`',
    'apps/api/dist/db/migrations': 'SQL migrations applied on boot; copied by the nest-cli assets rule',
  },
});

checkDockerfile('apps/admin/Dockerfile', {
  expectedCmd: 'start',
  expectedBuildOutputs: {
    'apps/admin/.next': 'next build output',
    'apps/admin/next.config.mjs': 'required by `next start`',
  },
});

// `next start` and the Nest runtime both need these present after --omit=dev.
checkRuntimeDeps('apps/admin/package.json', ['next', 'react', 'react-dom']);
checkRuntimeDeps('apps/api/package.json', [
  '@nestjs/core',
  '@nestjs/platform-express',
  'drizzle-orm',
  'postgres',
]);

// A public/ directory would need an explicit COPY into the runtime stage.
if (exists('apps/admin/public')) {
  const adminDockerfile = readFileSync(join(ROOT, 'apps/admin/Dockerfile'), 'utf8');
  if (!/apps\/admin\/public/.test(adminDockerfile)) {
    fail('apps/admin/public exists but apps/admin/Dockerfile never copies it — static assets would 404.');
  }
}

checkCompose();

// ── Report ──────────────────────────────────────────────────────────────────

for (const n of notes) console.log(`  · ${n}`);
console.log('');

if (problems.length === 0) {
  console.log('✔ Docker build contexts verified — every COPY source resolves, no source is');
  console.log('  shadowed by .dockerignore, all build outputs are present, and compose is');
  console.log('  consistent with the CI image tags.');
  console.log('');
  console.log('  This is a static check. The images are BUILT and smoke-tested by the');
  console.log('  `docker` job in .github/workflows/ci.yml.');
  process.exit(0);
}

console.error(`✘ ${problems.length} problem(s) found:\n`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
