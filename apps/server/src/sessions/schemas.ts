import { SessionFormat } from '@baltic/database';
import { z } from 'zod';

/** Mirrors the Prisma enum; the assertion below fails the build if they drift. */
export const SESSION_FORMATS = [
  'KEYNOTE',
  'TALK',
  'WORKSHOP',
  'PANEL',
  'LIGHTNING',
  'BREAK',
  'OTHER',
] as const;

type AssertSame<A extends B, B> = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _FormatsMatch = AssertSame<(typeof SESSION_FORMATS)[number], keyof typeof SessionFormat> &
  AssertSame<keyof typeof SessionFormat, (typeof SESSION_FORMATS)[number]>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const oneOrMany = <T extends z.ZodType>(item: T) => z.union([item, z.array(item)]).optional();

const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD, e.g. 2026-09-24');
const time = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 14:30')
  .transform((value) => value.padStart(5, '0'));

export const listSessionsShape = {
  day: oneOrMany(day).describe(
    'Only sessions on this day or days, as YYYY-MM-DD in event local time. ' +
      'Call get_session_filters to see which days the agenda covers.',
  ),
  search: optionalText(200).describe(
    'Free-text search across title, description, speaker names, companies and taglines, and tags ' +
      '(case-insensitive). Use for topics such as "Copilot" or "Dataverse security".',
  ),
  speaker: optionalText(150).describe('Only sessions given by a speaker whose name contains this.'),
  badge: oneOrMany(z.string().trim().min(1).max(100)).describe(
    'Only sessions with at least one speaker holding this badge, e.g. MVP or MCT ' +
      '(case-insensitive). get_session_filters lists the badges that exist.',
  ),
  room: oneOrMany(z.string().trim().min(1).max(100)).describe('Exact room name(s), case-insensitive.'),
  track: oneOrMany(z.string().trim().min(1).max(100)).describe('Exact track name(s), case-insensitive.'),
  format: oneOrMany(z.enum(SESSION_FORMATS)).describe(
    'Session format(s). BREAK covers registration, coffee, lunch and networking slots.',
  ),
  level: oneOrMany(z.string().trim().min(1).max(50)).describe('Level(s), case-insensitive.'),
  language: optionalText(50).describe('Language the session is delivered in, case-insensitive.'),
  tag: oneOrMany(z.string().trim().min(1).max(100)).describe(
    'Sessions carrying any of these tags (case-insensitive).',
  ),
  from: time.optional().describe(
    'Only sessions still running at or after this local time (HH:MM). Combine with `to` for ' +
      '"what is on between 14:00 and 15:00"; set both to the same time for "what is on at 14:00".',
  ),
  to: time.optional().describe('Only sessions that start at or before this local time (HH:MM).'),
  excludeBreaks: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .default(false)
    .describe('Leave out BREAK slots (coffee, lunch, registration).'),
  page: z.coerce.number().int().min(1).default(1).describe('1-based page number.'),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Results per page (max 200).'),
};

export const listSessionsSchema = z.object(listSessionsShape);
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;

export const sessionIdentifierShape = {
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe(
      'Session id (UUID) as returned by list_sessions, the agenda id, or the exact session title.',
    ),
};
