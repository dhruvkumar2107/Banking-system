import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit config — used to GENERATE SQL migrations from the schema.
 * `npm run migrate:generate` writes versioned SQL into ./src/db/migrations.
 * Applying migrations is done by src/db/migrate.ts (works for both PGlite and Postgres).
 */
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  verbose: true,
  strict: true,
} satisfies Config;
