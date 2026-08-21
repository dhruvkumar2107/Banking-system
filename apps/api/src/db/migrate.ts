import 'dotenv/config';
import { createDb } from './client';
import { applyMigrations, migrationsFolder } from './run-migrations';

/**
 * Apply all generated SQL migrations to the configured database.
 * Works for both PGlite (default) and a real Postgres (DATABASE_URL).
 *   npm run migrate:generate   # regenerate SQL from schema.ts
 *   npm run migrate            # apply
 */
async function main() {
  const bundle = await createDb();
  // eslint-disable-next-line no-console
  console.log(`[migrate] dialect=${bundle.dialect} folder=${migrationsFolder()}`);
  await applyMigrations(bundle);
  // eslint-disable-next-line no-console
  console.log('[migrate] done ✔');
  await bundle.close();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed', err);
  process.exit(1);
});
