import * as path from 'node:path';
import type { DbBundle } from './client';

/**
 * Resolve the folder holding generated SQL migrations. Works whether we're
 * running from source (tsx: src/db) or compiled (node: dist/db) — nest-cli copies
 * db/migrations into dist as an asset.
 */
export function migrationsFolder(): string {
  return path.join(__dirname, 'migrations');
}

/**
 * Apply all pending SQL migrations to the given database. Idempotent — drizzle
 * tracks applied migrations in a metadata table, so it's safe to call on every
 * boot. Picks the correct migrator for the active dialect (PGlite or postgres-js).
 */
export async function applyMigrations(bundle: DbBundle, folder = migrationsFolder()): Promise<void> {
  if (bundle.dialect === 'pglite') {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(bundle.db as never, { migrationsFolder: folder });
  } else {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(bundle.db as never, { migrationsFolder: folder });
  }
}
