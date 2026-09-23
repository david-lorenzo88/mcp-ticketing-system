import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AppError } from '../lib/errors.js';
import { listSessionsShape, sessionIdentifierShape } from '../sessions/schemas.js';
import { getSession, getSessionFilters, listSessions } from '../sessions/service.js';
import {
  cancelTicketShape,
  createTicketShape,
  listTicketsShape,
  ticketIdentifierShape,
  updateTicketShape,
} from '../tickets/schemas.js';
import {
  cancelTicket,
  checkInTicket,
  createTicket,
  getTicket,
  getTicketStats,
  listTickets,
  updateTicket,
} from '../tickets/service.js';

export const MCP_SERVER_NAME = 'baltic-summit-ticketing';
export const MCP_SERVER_VERSION = '1.0.0';

/**
 * Tool results are returned as a one-line human summary followed by the full
 * JSON payload. Copilot Studio and Foundry agents read the summary directly
 * when answering, and fall back to the JSON when they need specific fields.
 */
function ok(summary: string, data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
  };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Turns thrown errors into tool-level errors. An agent can read and recover
 * from these; a transport-level exception would just abort its turn.
 */
async function handle(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) return fail(error.message);
    console.error('[mcp] tool failed:', error);
    return fail(
      `The ticketing system could not complete that request: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Builds a fresh MCP server instance.
 *
 * One server (and one transport) is created per HTTP request — see
 * `mcp/routes.ts`. That keeps the endpoint stateless, so Azure Container Apps
 * can scale it to several replicas without sticky sessions.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions:
        'Ticketing and admission system for the Baltic Summit conference. Use these tools to ' +
        'look up attendees, register new tickets, correct ticket details, cancel tickets and ' +
        'check attendees in at the door. Tickets are identified either by a UUID or by their ' +
        'printed ticket number such as BS26-00042 — both are accepted everywhere an identifier ' +
        'is asked for. Always confirm the attendee name back to the user after a change. ' +
        'The conference programme is also available: list_sessions browses and filters the ' +
        'agenda by day, time, room, track, format, speaker or topic, get_session returns one ' +
        'session in full with its description and speaker bios, and get_session_filters lists ' +
        'the days, rooms, tracks and tags you can filter on. Session times are local event time.',
    },
  );

  server.registerTool(
    'list_tickets',
    {
      title: 'List tickets',
      description:
        'Search and list Baltic Summit tickets. Supports free-text search across name, email ' +
        'and company, filtering by status and ticket type, and paging. Use this to answer ' +
        'questions like "how many people from Contoso are coming" or "show cancelled tickets".',
      inputSchema: listTicketsShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      handle(async () => {
        const result = await listTickets(args);
        const { total, page, totalPages } = result.pagination;
        return ok(
          `Found ${total} ticket(s). Showing page ${page} of ${totalPages} (${result.tickets.length} on this page).`,
          result,
        );
      }),
  );

  server.registerTool(
    'get_ticket',
    {
      title: 'Get a ticket',
      description:
        'Retrieve one ticket in full by its UUID or its printed ticket number (e.g. BS26-00042).',
      inputSchema: ticketIdentifierShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ identifier }) =>
      handle(async () => {
        const ticket = await getTicket(identifier);
        return ok(
          `Ticket ${ticket.ticketNumber} — ${ticket.fullName} (${ticket.ticketType}, ${ticket.status}).`,
          ticket,
        );
      }),
  );

  server.registerTool(
    'create_ticket',
    {
      title: 'Create a ticket',
      description:
        'Register a new attendee and issue them a Baltic Summit ticket. Returns the new ticket ' +
        'including its ticket number. Ask the user for the attendee name and email before ' +
        'calling this if you do not already have them.',
      inputSchema: createTicketShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) =>
      handle(async () => {
        const ticket = await createTicket(args);
        return ok(
          `Created ticket ${ticket.ticketNumber} for ${ticket.fullName} (${ticket.ticketType}, ${ticket.status}).`,
          ticket,
        );
      }),
  );

  server.registerTool(
    'update_ticket',
    {
      title: 'Update a ticket',
      description:
        'Change the details of an existing ticket — attendee name, email, company, ticket type, ' +
        'price or notes. Only the fields you pass are changed. To cancel or admit an attendee, ' +
        'prefer cancel_ticket and check_in_ticket.',
      inputSchema: { ...ticketIdentifierShape, ...updateTicketShape },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ identifier, ...changes }) =>
      handle(async () => {
        const ticket = await updateTicket(identifier, changes);
        return ok(`Updated ticket ${ticket.ticketNumber} for ${ticket.fullName}.`, ticket);
      }),
  );

  server.registerTool(
    'cancel_ticket',
    {
      title: 'Cancel a ticket',
      description:
        'Cancel a ticket so it is no longer valid for admission, optionally recording a reason. ' +
        'The ticket is kept in the system with status CANCELLED rather than deleted, so it stays ' +
        'auditable and can be reinstated with update_ticket.',
      inputSchema: cancelTicketShape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ identifier, reason }) =>
      handle(async () => {
        const ticket = await cancelTicket(identifier, reason);
        return ok(
          `Cancelled ticket ${ticket.ticketNumber} for ${ticket.fullName}.` +
            (reason ? ` Reason: ${reason}` : ''),
          ticket,
        );
      }),
  );

  server.registerTool(
    'check_in_ticket',
    {
      title: 'Check in a ticket',
      description:
        'Admit an attendee at the door by marking their ticket CHECKED_IN and stamping the time. ' +
        'Fails if the ticket is cancelled or has already been checked in, and says which.',
      inputSchema: ticketIdentifierShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ identifier }) =>
      handle(async () => {
        const ticket = await checkInTicket(identifier);
        return ok(
          `Checked in ${ticket.fullName} on ticket ${ticket.ticketNumber} at ${ticket.checkedInAt}.`,
          ticket,
        );
      }),
  );

  server.registerTool(
    'get_ticket_stats',
    {
      title: 'Get ticket statistics',
      description:
        'Summary of the whole event: total tickets, a breakdown by status and by ticket type, ' +
        'how many attendees have been admitted, and total revenue from non-cancelled tickets. ' +
        'Use this for "how are sales going" or "how many people are inside" questions.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      handle(async () => {
        const stats = await getTicketStats();
        return ok(
          `${stats.total} ticket(s) in total, ${stats.checkedIn} checked in ` +
            `(${stats.admissionRate}% of valid tickets). Revenue: ${stats.revenue.amount} ${stats.revenue.currency}.`,
          stats,
        );
      }),
  );

  server.registerTool(
    'list_sessions',
    {
      title: 'List conference sessions',
      description:
        'Browse the Baltic Summit agenda, ordered by day, start time and room. Filter by day, ' +
        'local time window, room, track, format (keynote, talk, workshop, …), level, language, ' +
        'tag, speaker or speaker badge (e.g. MVP), or search free text across titles, ' +
        'descriptions and speakers. Each ' +
        'result has a short abstract; call get_session for the full description and speaker ' +
        'bios. Use for "what is on Thursday afternoon", "sessions about Copilot" or ' +
        '"what is Jane Doe presenting".',
      inputSchema: listSessionsShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      handle(async () => {
        const result = await listSessions(args);
        const { total, page, totalPages } = result.pagination;
        const days = [
          ...result.byDay.map((d) => `${d.dayName} ${d.day}: ${d.sessions}`),
          ...(result.unscheduled ? [`not yet scheduled: ${result.unscheduled}`] : []),
        ].join(', ');
        return ok(
          `Found ${total} session(s)${days ? ` (${days})` : ''}. ` +
            `Showing page ${page} of ${totalPages} (${result.sessions.length} on this page).`,
          result,
        );
      }),
  );

  server.registerTool(
    'get_session',
    {
      title: 'Get a session',
      description:
        'Retrieve one conference session in full: complete description, schedule, room, ' +
        'track, level, tags, every speaker with company, tagline, badges (MVP, MCT, …), bio, ' +
        'photo URL and profile links, and the other ' +
        'sessions running at the same time. Accepts the id from list_sessions or the exact title.',
      inputSchema: sessionIdentifierShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ identifier }) =>
      handle(async () => {
        const session = await getSession(identifier);
        const when = !session.day
          ? 'not yet scheduled'
          : session.start
            ? `${session.dayName} ${session.day}, ${session.start}${session.end ? `–${session.end}` : ''}`
            : `${session.dayName} ${session.day}`;
        const by = session.speakers.map((s) => s.name).join(', ');
        return ok(
          `"${session.title}" — ${when}${session.room ? `, ${session.room}` : ''}` +
            `${by ? `, by ${by}` : ''}.`,
          session,
        );
      }),
  );

  server.registerTool(
    'get_session_filters',
    {
      title: 'Get agenda filter values',
      description:
        'List the values the agenda can be filtered on: each day with its session count and ' +
        'opening/closing times, plus every room, track, format, level, language, tag and ' +
        'speaker badge. Call this before list_sessions when you need an exact room, track, tag ' +
        'or badge name.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      handle(async () => {
        const filters = await getSessionFilters();
        return ok(
          `${filters.totalSessions} session(s) over ${filters.days.length} day(s), ` +
            `${filters.rooms.length} room(s), ${filters.speakers} speaker(s).`,
          filters,
        );
      }),
  );

  return server;
}
