import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env from the server package first, then fall back to the repo root so
// a single root .env works for the whole workspace. Azure injects real
// environment variables, which always win — dotenv never overwrites them.
loadDotenv({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — see .env.example'),
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Prefix for human-readable ticket numbers, e.g. BS26 -> BS26-00042. */
  TICKET_PREFIX: z.string().min(1).max(10).default('BS26'),

  /** Comma-separated allowed browser origins, or "*" for any. */
  CORS_ORIGINS: z.string().default('*'),

  /**
   * Optional shared secret for /mcp. Empty (the default) leaves the MCP
   * endpoint open, which is what a no-authentication setup wants.
   */
  MCP_API_KEY: z.string().default(''),

  /**
   * Respond to MCP POSTs with plain JSON instead of an SSE stream. Both are
   * valid Streamable HTTP; JSON avoids response buffering in Azure ingress and
   * is easier to debug with curl, and is accepted by Copilot Studio and Foundry.
   */
  MCP_JSON_RESPONSE: booleanish.default(true),

  /** Public https URL of the deployment; only used for log output. */
  PUBLIC_BASE_URL: z.string().default(''),

  /** Absolute or relative path to the built web SPA. Auto-detected when empty. */
  WEB_DIST_PATH: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${issues.join('\n')}`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins: string[] | '*' =
  env.CORS_ORIGINS.trim() === '*'
    ? '*'
    : env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
