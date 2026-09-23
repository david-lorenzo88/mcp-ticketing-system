import { Router } from 'express';
import { multiValue, parseOrThrow } from '../lib/http.js';
import { listSessionsSchema } from './schemas.js';
import { getSession, getSessionFilters, listSessions } from './service.js';

/** Read-only agenda API for the web UI; the MCP tools call the same service. */
export const sessionsRouter: Router = Router();

// Must be registered before "/:identifier" so "filters" is not read as an id.
sessionsRouter.get('/filters', async (_req, res) => {
  res.json(await getSessionFilters());
});

sessionsRouter.get('/', async (req, res) => {
  const input = parseOrThrow(listSessionsSchema, {
    ...req.query,
    day: multiValue(req.query.day),
    room: multiValue(req.query.room),
    track: multiValue(req.query.track),
    format: multiValue(req.query.format),
    level: multiValue(req.query.level),
    tag: multiValue(req.query.tag),
    badge: multiValue(req.query.badge),
  });

  res.json(await listSessions(input));
});

sessionsRouter.get('/:identifier', async (req, res) => {
  res.json(await getSession(req.params.identifier));
});
