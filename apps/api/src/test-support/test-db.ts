import * as path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../db/schema';
import type { AppDatabase } from '../db/client';

/**
 * Spin up a throwaway in-memory PGlite database with the full schema applied.
 * Used by unit and e2e tests so they run against real Postgres semantics with
 * zero external services.
 */
export async function createTestDb(): Promise<{ db: AppDatabase; close: () => Promise<void> }> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as AppDatabase;
  await migrate(db as never, {
    migrationsFolder: path.join(__dirname, '..', 'db', 'migrations'),
  });
  return { db, close: async () => client.close() };
}
