import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getPrisma } from '@baltic/database';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { corsOrigins, env, isProduction } from './env.js';
import { AppError } from './lib/errors.js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from './mcp/server.js';
import { mcpRouter } from './mcp/routes.js';
import { sessionsRouter } from './sessions/routes.js';
import { ticketsRouter } from './tickets/routes.js';

/**
 * Locates the built SPA. In development Vite serves the UI itself and this
 * returns null; in the container the build is copied next to the server.
 */
function findWebDist(): string | null {
  const candidates = [
    env.WEB_DIST_PATH && resolve(env.WEB_DIST_PATH),
    resolve(import.meta.dirname, '../public'),
    resolve(import.meta.dirname, '../../web/dist'),
  ].filter((value): value is string => Boolean(value));

  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? null;
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true); // Azure Container Apps / App Service sit behind a proxy.

  app.use(
    cors({
      origin: corsOrigins === '*' ? true : corsOrigins,
      // Streamable HTTP clients read the session header when one is in use.
      exposedHeaders: ['mcp-session-id'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  if (!isProduction) {
    app.use((req, _res, next) => {
      console.log(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  // --- Health -------------------------------------------------------------
  app.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      service: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      mcpEndpoint: env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/mcp` : '/mcp',
      mcpAuth: env.MCP_API_KEY ? 'api-key' : 'none',
      time: new Date().toISOString(),
    });
  });

  // Readiness: only reports healthy once the database actually answers.
  app.get('/readyz', async (_req, res) => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      res.json({ status: 'ready', database: 'up' });
    } catch (error) {
      res.status(503).json({
        status: 'not-ready',
        database: 'down',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // --- API + MCP ----------------------------------------------------------
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/mcp', mcpRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Unknown API endpoint.' });
  });

  // --- Static SPA ---------------------------------------------------------
  const webDist = findWebDist();
  if (webDist) {
    app.use(express.static(webDist, { index: false, maxAge: isProduction ? '1h' : 0 }));

    // History-API fallback. Written as plain middleware rather than a wildcard
    // route because Express 5 no longer accepts a bare "*" path.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) return next();
      res.sendFile(join(webDist, 'index.html'));
    });
  }

  // --- Errors -------------------------------------------------------------
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error('[api] unhandled error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: isProduction
        ? 'Something went wrong handling that request.'
        : error instanceof Error
          ? error.message
          : String(error),
    });
  });

  return app;
}

export { findWebDist };
