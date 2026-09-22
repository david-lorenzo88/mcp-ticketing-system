import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * Connection URLs no longer live in `schema.prisma`. The CLI (migrate,
 * introspect, studio) reads the URL from here; the application runtime gets
 * its connection through the `@prisma/adapter-pg` driver adapter in
 * `src/index.ts`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
