import { env } from '../env.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Renders the public ticket number for a stored row, e.g. `BS26-00042`.
 *
 * The number is derived from the autoincrementing `reference` column rather
 * than stored, so it can never drift from the row it belongs to and the prefix
 * can be changed per environment (TICKET_PREFIX) without a data migration.
 */
export function formatTicketNumber(reference: number): string {
  return `${env.TICKET_PREFIX}-${String(reference).padStart(5, '0')}`;
}

/**
 * Pulls the numeric reference out of anything that looks like a ticket number:
 * `BS26-00042`, `bs26 42`, `#42` and `42` all resolve to 42.
 */
export function parseTicketReference(input: string): number | null {
  const match = input.trim().match(/(\d+)\s*$/);
  if (!match) return null;

  const reference = Number.parseInt(match[1]!, 10);
  return Number.isSafeInteger(reference) && reference > 0 ? reference : null;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Builds a Prisma `where` clause that accepts either a UUID id or a ticket
 * number, so callers (and agents) never have to care which one they hold.
 */
export function ticketIdentifierWhere(
  identifier: string,
): { id: string } | { reference: number } | null {
  const value = identifier.trim();
  if (!value) return null;
  if (isUuid(value)) return { id: value };

  const reference = parseTicketReference(value);
  return reference === null ? null : { reference };
}
