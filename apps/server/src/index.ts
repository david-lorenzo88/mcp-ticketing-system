import { disconnectPrisma } from '@baltic/database';
import { createApp, findWebDist } from './app.js';
import { env } from './env.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '') || `http://localhost:${env.PORT}`;

  console.log(`\n  Baltic Summit ticketing  ·  ${env.NODE_ENV}`);
  console.log(`  ──────────────────────────────────────────────`);
  console.log(`  API          ${base}/api/tickets`);
  console.log(`  MCP          ${base}/mcp   (Streamable HTTP, POST)`);
  console.log(`  Health       ${base}/healthz  ·  ${base}/readyz`);
  console.log(`  MCP auth     ${env.MCP_API_KEY ? 'API key required' : 'open (no authentication)'}`);
  console.log(`  Web UI       ${findWebDist() ? base + '/' : 'run `npm run dev:web` (Vite dev server)'}\n`);
});

/** Drain in-flight requests and close the database pool before exiting. */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down.`);

  const timeout = setTimeout(() => {
    console.error('Forcing exit after 10s.');
    process.exit(1);
  }, 10_000).unref();

  server.close(async () => {
    clearTimeout(timeout);
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
