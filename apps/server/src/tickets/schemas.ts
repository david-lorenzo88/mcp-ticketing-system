import { TicketStatus, TicketType } from '@baltic/database';
import { z } from 'zod';

/**
 * Literal tuples mirroring the Prisma enums. Declaring them explicitly (rather
 * than deriving them) keeps a stable, readable order in the JSON Schema that
 * Copilot Studio and Foundry show to their agents. The assertions below fail
 * the build if the database enums and these lists ever drift apart.
 */
export const TICKET_TYPES = [
  'FULL_PASS',
  'CONFERENCE',
  'WORKSHOP',
  'SPEAKER',
  'SPONSOR',
  'VOLUNTEER',
  'STUDENT',
] as const;

export const TICKET_STATUSES = ['RESERVED', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED'] as const;

type AssertSame<A extends B, B> = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TypesMatch = AssertSame<(typeof TICKET_TYPES)[number], keyof typeof TicketType> &
  AssertSame<keyof typeof TicketType, (typeof TICKET_TYPES)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StatusesMatch = AssertSame<(typeof TICKET_STATUSES)[number], keyof typeof TicketStatus> &
  AssertSame<keyof typeof TicketStatus, (typeof TICKET_STATUSES)[number]>;

const email = z.string().trim().toLowerCase().email('Must be a valid email address').max(255);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/** Field-by-field shape for creating a ticket. Reused verbatim as an MCP tool input schema. */
export const createTicketShape = {
  firstName: z.string().trim().min(1, 'First name is required').max(100)
    .describe("Attendee's first name."),
  lastName: z.string().trim().min(1, 'Last name is required').max(100)
    .describe("Attendee's last name."),
  email: email.describe("Attendee's email address. Used to contact them about the ticket."),
  phone: optionalText(50).describe('Optional phone number, including country code.'),
  company: optionalText(150).describe('Optional company or organisation the attendee represents.'),
  jobTitle: optionalText(150).describe('Optional job title.'),
  ticketType: z
    .enum(TICKET_TYPES)
    .default('CONFERENCE')
    .describe(
      'Admission type. FULL_PASS covers the workshop day and both conference days; ' +
        'CONFERENCE covers the conference days only; WORKSHOP covers the workshop day only. ' +
        'SPEAKER, SPONSOR and VOLUNTEER are complimentary passes; STUDENT is the discounted rate.',
    ),
  status: z
    .enum(TICKET_STATUSES)
    .default('RESERVED')
    .describe(
      'Initial status. RESERVED holds a place without payment; CONFIRMED means the ticket is ' +
        'paid and valid for admission. Use CONFIRMED when the attendee has already paid.',
    ),
  priceAmount: z.coerce
    .number()
    .min(0, 'Price cannot be negative')
    .max(1_000_000)
    .default(0)
    .describe('Price paid, in the ticket currency. Use 0 for complimentary passes.'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Use a 3-letter ISO currency code')
    .default('PLN')
    .describe('ISO 4217 currency code, e.g. PLN or EUR.'),
  dietaryRequirements: optionalText(500)
    .describe('Optional dietary requirements or allergies for catering.'),
  notes: optionalText(2000).describe('Optional free-text internal notes about this ticket.'),
};

export const createTicketSchema = z.object(createTicketShape);
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/** Every field optional — a partial edit of an existing ticket. */
export const updateTicketShape = {
  firstName: z.string().trim().min(1).max(100).optional().describe("Attendee's first name."),
  lastName: z.string().trim().min(1).max(100).optional().describe("Attendee's last name."),
  email: email.optional().describe("Attendee's email address."),
  phone: optionalText(50).describe('Phone number. Pass an empty string to clear it.'),
  company: optionalText(150).describe('Company or organisation.'),
  jobTitle: optionalText(150).describe('Job title.'),
  ticketType: z.enum(TICKET_TYPES).optional().describe('Change the admission type.'),
  status: z
    .enum(TICKET_STATUSES)
    .optional()
    .describe(
      'Change the status. Prefer the dedicated cancel_ticket and check_in_ticket tools, which ' +
        'also record the timestamp and reason.',
    ),
  priceAmount: z.coerce.number().min(0).max(1_000_000).optional().describe('Price paid.'),
  currency: z.string().trim().toUpperCase().length(3).optional().describe('ISO 4217 currency code.'),
  dietaryRequirements: optionalText(500).describe('Dietary requirements or allergies.'),
  notes: optionalText(2000).describe('Internal notes.'),
};

export const updateTicketSchema = z
  .object(updateTicketShape)
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const listTicketsShape = {
  search: optionalText(200).describe(
    'Free-text search across first name, last name, email and company (case-insensitive).',
  ),
  status: z
    .union([z.enum(TICKET_STATUSES), z.array(z.enum(TICKET_STATUSES))])
    .optional()
    .describe('Filter by one status or a list of statuses.'),
  ticketType: z
    .union([z.enum(TICKET_TYPES), z.array(z.enum(TICKET_TYPES))])
    .optional()
    .describe('Filter by one ticket type or a list of types.'),
  page: z.coerce.number().int().min(1).default(1).describe('1-based page number.'),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(25)
    .describe('Results per page (max 200).'),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'lastName', 'reference'])
    .default('createdAt')
    .describe('Field to sort by.'),
  sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort direction.'),
};

export const listTicketsSchema = z.object(listTicketsShape);
export type ListTicketsInput = z.infer<typeof listTicketsSchema>;

export const ticketIdentifierShape = {
  identifier: z
    .string()
    .trim()
    .min(1)
    .describe('Ticket id (UUID) or ticket number such as BS26-00042. Both are accepted.'),
};

export const cancelTicketShape = {
  ...ticketIdentifierShape,
  reason: optionalText(500).describe('Optional reason recorded against the cancellation.'),
};
