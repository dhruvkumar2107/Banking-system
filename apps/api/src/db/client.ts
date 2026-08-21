import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * A single application database type. Both the postgres-js and PGlite drizzle
 * instances implement the same Postgres query builder, so we expose one type and
 * cast the PGlite instance to it — the runtime API is identical (pg dialect).
 */
export type AppDatabase = PostgresJsDatabase<typeof schema>;
export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

export interface DbBundle {
  db: AppDatabase;
  dialect: 'pglite' | 'postgres';
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  url?: string | null;
  pglitePath?: string;
}

/**
 * Create a Drizzle database.
 *  - If a Postgres URL is provided (DATABASE_URL), connect via postgres-js.
 *  - Otherwise fall back to PGlite (embedded Postgres in WASM) with a file store,
 *    so the app runs with zero external services while keeping Postgres semantics.
 */
export async function createDb(opts: CreateDbOptions = {}): Promise<DbBundle> {
  const url = (opts.url ?? process.env.DATABASE_URL ?? '').trim();

  if (url.length > 0) {
    const postgres = (await import('postgres')).default;
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const sql = postgres(url, { max: 10, onnotice: () => undefined });
    const db = drizzle(sql, { schema });
    return {
      db,
      dialect: 'postgres',
      close: async () => {
        await sql.end({ timeout: 5 });
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const dataPath = opts.pglitePath ?? process.env.PGLITE_PATH ?? '.data/pigmee';

  if (dataPath !== 'memory://' && !dataPath.startsWith('memory')) {
    fs.mkdirSync(path.dirname(path.resolve(dataPath)), { recursive: true });
  }

  const client = new PGlite(dataPath);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as AppDatabase;
  return {
    db,
    dialect: 'pglite',
    close: async () => {
      await client.close();
    },
  };
}

export { schema };
