import { Router } from 'express';
import { z } from 'zod';
import { multiValue, parseOrThrow } from '../lib/http.js';
import {
  cancelTicketShape,
  createTicketSchema,
  listTicketsSchema,
  updateTicketSchema,
} from './schemas.js';
import {
  cancelTicket,
  checkInTicket,
  createTicket,
  getTicket,
  getTicketStats,
  listTickets,
  updateTicket,
} from './service.js';

export const ticketsRouter: Router = Router();

// Must be registered before "/:identifier" so "stats" is not read as an id.
ticketsRouter.get('/stats', async (_req, res) => {
  res.json(await getTicketStats());
});

ticketsRouter.get('/', async (req, res) => {
  const input = parseOrThrow(listTicketsSchema, {
    ...req.query,
    status: multiValue(req.query.status),
    ticketType: multiValue(req.query.ticketType),
  });

  res.json(await listTickets(input));
});

ticketsRouter.get('/:identifier', async (req, res) => {
  res.json(await getTicket(req.params.identifier));
});

ticketsRouter.post('/', async (req, res) => {
  const ticket = await createTicket(parseOrThrow(createTicketSchema, req.body ?? {}));
  res.status(201).json(ticket);
});

ticketsRouter.patch('/:identifier', async (req, res) => {
  const input = parseOrThrow(updateTicketSchema, req.body ?? {});
  res.json(await updateTicket(req.params.identifier, input));
});

ticketsRouter.post('/:identifier/cancel', async (req, res) => {
  const { reason } = parseOrThrow(
    z.object({ reason: cancelTicketShape.reason }),
    req.body ?? {},
  );
  res.json(await cancelTicket(req.params.identifier, reason));
});

ticketsRouter.post('/:identifier/check-in', async (req, res) => {
  res.json(await checkInTicket(req.params.identifier));
});
