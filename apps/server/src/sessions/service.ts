import { getPrisma, localToUtc, Prisma, utcToLocalTime } from '@baltic/database';
import { env } from '../env.js';
import { NotFoundError } from '../lib/errors.js';
import { isUuid } from '../lib/ticket-number.js';
import type { ListSessionsInput } from './schemas.js';

const withSpeakers = {
  speakers: { orderBy: { position: 'asc' }, include: { speaker: true } },
} satisfies Prisma.SessionInclude;

type SessionRow = Prisma.SessionGetPayload<{ include: typeof withSpeakers }>;

export interface SessionSpeakerSummary {
  id: string;
  name: string;
  company: string | null;
  /** Recognitions such as MVP or MCT. */
  badges: string[];
  photoUrl: string | null;
}

export interface SessionSpeakerDetail extends SessionSpeakerSummary {
  jobTitle: string | null;
  /** Profile headline as published by the speaker. */
  tagline: string | null;
  bio: string | null;
  links: Record<string, string> | null;
}

/** Compact shape for lists — the description is cut to a short abstract. */
export interface SessionSummaryDto {
  id: string;
  externalId: string;
  title: string;
  /** Null for a session that is published but has no slot yet. */
  day: string | null;
  dayName: string | null;
  start: string | null;
  end: string | null;
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  timezone: string;
  room: string | null;
  format: SessionRow['format'];
  formatLabel: string | null;
  track: string | null;
  level: string | null;
  language: string | null;
  tags: string[];
  speakers: SessionSpeakerSummary[];
  abstract: string | null;
}

export interface SessionDetailDto extends Omit<SessionSummaryDto, 'speakers' | 'abstract'> {
  description: string | null;
  url: string | null;
  partnerUrl: string | null;
  speakers: SessionSpeakerDetail[];
  /** Other sessions in the same time slot, to help pick between them. */
  concurrentSessions: Array<Pick<SessionSummaryDto, 'id' | 'title' | 'room' | 'start' | 'end'>>;
}

export interface SessionListResult {
  sessions: SessionSummaryDto[];
  /** How many matching sessions fall on each day, across all pages. */
  byDay: Array<{ day: string; dayName: string; sessions: number }>;
  /** Matching sessions that have no slot on the agenda yet. */
  unscheduled: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface SessionFilters {
  timezone: string;
  days: Array<{ day: string; dayName: string; sessions: number; firstStart: string | null; lastEnd: string | null }>;
  rooms: string[];
  tracks: string[];
  formats: Array<{ format: string; sessions: number }>;
  levels: string[];
  languages: string[];
  tags: string[];
  /** Speaker badges (MVP, MCT, …) with how many speakers hold each. */
  badges: Array<{ badge: string; speakers: number }>;
  speakers: number;
  totalSessions: number;
  /** Sessions published without a slot yet; they have no day or time. */
  unscheduledSessions: number;
}

const ABSTRACT_LENGTH = 240;

const isoDay = (value: Date) => value.toISOString().slice(0, 10);
const dayName = (day: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
const localTime = (value: Date | null) => (value ? utcToLocalTime(value, env.EVENT_TIMEZONE) : null);

function abstractOf(description: string | null): string | null {
  if (!description) return null;
  const flat = description.replace(/\s+/g, ' ').trim();
  if (flat.length <= ABSTRACT_LENGTH) return flat;
  const cut = flat.slice(0, ABSTRACT_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : ABSTRACT_LENGTH)}…`;
}

function scheduleOf(row: SessionRow) {
  const day = row.day ? isoDay(row.day) : null;
  return {
    day,
    dayName: day ? dayName(day) : null,
    start: localTime(row.startsAt),
    end: localTime(row.endsAt),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    durationMinutes:
      row.startsAt && row.endsAt
        ? Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000)
        : null,
    timezone: env.EVENT_TIMEZONE,
  };
}

export function toSummaryDto(row: SessionRow): SessionSummaryDto {
  return {
    id: row.id,
    externalId: row.externalId,
    title: row.title,
    ...scheduleOf(row),
    room: row.room,
    format: row.format,
    formatLabel: row.formatLabel,
    track: row.track,
    level: row.level,
    language: row.language,
    tags: row.tags,
    speakers: row.speakers.map(({ speaker }) => ({
      id: speaker.id,
      name: speaker.fullName,
      company: speaker.company,
      badges: speaker.badges,
      photoUrl: speaker.photoUrl,
    })),
    abstract: abstractOf(row.description),
  };
}

const asArray = <T>(value: T | T[] | undefined): T[] | undefined => {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list.length > 0 ? list : undefined;
};

/** Case-insensitive "equals any of" for a nullable text column. */
const equalsAny = (field: 'room' | 'track' | 'level' | 'language', values: string[]) => ({
  OR: values.map((value) => ({ [field]: { equals: value, mode: 'insensitive' as const } })),
});

/**
 * Postgres array filters are case-sensitive, so resolve what the caller typed
 * to the tags actually stored before filtering on them.
 */
async function storedTags(match: (tag: string) => boolean): Promise<string[]> {
  const rows = await getPrisma().$queryRaw<Array<{ tag: string }>>`
    SELECT DISTINCT unnest(tags) AS tag FROM sessions`;
  return rows.map((r) => r.tag).filter(match);
}

/** Speaker badges with holder counts; also used to resolve a badge case-insensitively. */
async function storedBadges(): Promise<Array<{ badge: string; speakers: number }>> {
  const rows = await getPrisma().$queryRaw<Array<{ badge: string; speakers: bigint }>>`
    SELECT badge, count(*) AS speakers FROM speakers, unnest(badges) AS badge
    GROUP BY badge ORDER BY count(*) DESC, badge`;
  return rows.map((r) => ({ badge: r.badge, speakers: Number(r.speakers) }));
}

async function eventDays(): Promise<string[]> {
  const rows = await getPrisma().session.findMany({
    where: { day: { not: null } },
    distinct: ['day'],
    select: { day: true },
    orderBy: { day: 'asc' },
  });
  return rows.flatMap((r) => (r.day ? [isoDay(r.day)] : []));
}

async function buildWhere(input: ListSessionsInput): Promise<Prisma.SessionWhereInput> {
  const and: Prisma.SessionWhereInput[] = [];

  const days = asArray(input.day);
  if (days) and.push({ day: { in: days.map((d) => new Date(`${d}T00:00:00Z`)) } });

  const formats = asArray(input.format);
  if (formats) and.push({ format: { in: formats } });
  if (input.excludeBreaks) and.push({ format: { not: 'BREAK' } });

  const rooms = asArray(input.room);
  if (rooms) and.push(equalsAny('room', rooms));
  const tracks = asArray(input.track);
  if (tracks) and.push(equalsAny('track', tracks));
  const levels = asArray(input.level);
  if (levels) and.push(equalsAny('level', levels));
  if (input.language) and.push(equalsAny('language', [input.language]));

  const tags = asArray(input.tag);
  if (tags) {
    const wanted = new Set(tags.map((t) => t.toLowerCase()));
    and.push({ tags: { hasSome: await storedTags((t) => wanted.has(t.toLowerCase())) } });
  }

  const badges = asArray(input.badge);
  if (badges) {
    const wanted = new Set(badges.map((b) => b.toLowerCase()));
    const matching = (await storedBadges()).map((b) => b.badge).filter((b) => wanted.has(b.toLowerCase()));
    and.push({ speakers: { some: { speaker: { badges: { hasSome: matching } } } } });
  }

  if (input.speaker) {
    and.push({
      speakers: {
        some: { speaker: { fullName: { contains: input.speaker, mode: 'insensitive' } } },
      },
    });
  }

  if (input.search) {
    const needle = input.search.toLowerCase();
    const matchingTags = await storedTags((t) => t.toLowerCase().includes(needle));
    const contains = { contains: input.search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { title: contains },
        { description: contains },
        { track: contains },
        {
          speakers: {
            some: {
              speaker: { OR: [{ fullName: contains }, { company: contains }, { tagline: contains }] },
            },
          },
        },
        ...(matchingTags.length > 0 ? [{ tags: { hasSome: matchingTags } }] : []),
      ],
    });
  }

  // Times are wall-clock in the event timezone, so they become a different
  // UTC window on each day the query covers.
  if (input.from || input.to) {
    const windowDays = days ?? (await eventDays());
    and.push({
      OR: windowDays.map((d) => ({
        day: new Date(`${d}T00:00:00Z`),
        ...(input.to ? { startsAt: { lte: localToUtc(d, input.to, env.EVENT_TIMEZONE) } } : {}),
        ...(input.from
          ? {
              OR: [
                { endsAt: { gt: localToUtc(d, input.from, env.EVENT_TIMEZONE) } },
                // Without an end time, fall back to the start.
                { endsAt: null, startsAt: { gte: localToUtc(d, input.from, env.EVENT_TIMEZONE) } },
              ],
            }
          : {}),
      })),
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

const agendaOrder: Prisma.SessionOrderByWithRelationInput[] = [
  { day: { sort: 'asc', nulls: 'last' } },
  { startsAt: { sort: 'asc', nulls: 'last' } },
  { room: { sort: 'asc', nulls: 'last' } },
  { title: 'asc' },
];

export async function listSessions(input: ListSessionsInput): Promise<SessionListResult> {
  const prisma = getPrisma();
  const { page, pageSize } = input;
  const where = await buildWhere(input);

  const [rows, total, perDay] = await Promise.all([
    prisma.session.findMany({
      where,
      include: withSpeakers,
      orderBy: agendaOrder,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.session.count({ where }),
    prisma.session.groupBy({ by: ['day'], where, _count: { _all: true }, orderBy: { day: 'asc' } }),
  ]);

  return {
    sessions: rows.map(toSummaryDto),
    byDay: perDay.flatMap((g) => {
      if (!g.day) return [];
      const day = isoDay(g.day);
      return [{ day, dayName: dayName(day), sessions: g._count._all }];
    }),
    unscheduled: perDay.find((g) => g.day === null)?._count._all ?? 0,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getSession(identifier: string): Promise<SessionDetailDto> {
  const prisma = getPrisma();
  const value = identifier.trim();

  const row =
    (isUuid(value)
      ? await prisma.session.findUnique({ where: { id: value }, include: withSpeakers })
      : null) ??
    (await prisma.session.findUnique({ where: { externalId: value }, include: withSpeakers })) ??
    (await prisma.session.findFirst({
      where: { title: { equals: value, mode: 'insensitive' } },
      include: withSpeakers,
    }));

  if (!row) {
    throw new NotFoundError(
      `No session found for "${identifier}". Use list_sessions with a search term to find its id.`,
    );
  }

  const concurrent =
    row.startsAt && row.endsAt
      ? await prisma.session.findMany({
          where: {
            id: { not: row.id },
            format: { not: 'BREAK' },
            startsAt: { lt: row.endsAt },
            endsAt: { gt: row.startsAt },
          },
          include: withSpeakers,
          orderBy: agendaOrder,
        })
      : [];

  const { abstract: _abstract, speakers: _speakers, ...summary } = toSummaryDto(row);
  return {
    ...summary,
    description: row.description,
    url: row.url,
    partnerUrl: row.partnerUrl,
    speakers: row.speakers.map(({ speaker }) => ({
      id: speaker.id,
      name: speaker.fullName,
      company: speaker.company,
      badges: speaker.badges,
      photoUrl: speaker.photoUrl,
      jobTitle: speaker.jobTitle,
      tagline: speaker.tagline,
      bio: speaker.bio,
      links: (speaker.links as Record<string, string> | null) ?? null,
    })),
    concurrentSessions: concurrent.map((s) => {
      const dto = toSummaryDto(s);
      return { id: dto.id, title: dto.title, room: dto.room, start: dto.start, end: dto.end };
    }),
  };
}

const distinctText = async (field: 'room' | 'track' | 'level' | 'language'): Promise<string[]> => {
  // `field` is one of four literal column names, never user input.
  const column = Prisma.raw(`"${field}"`);
  const rows = await getPrisma().$queryRaw<Array<{ value: string }>>`
    SELECT DISTINCT ${column} AS value FROM sessions WHERE ${column} IS NOT NULL ORDER BY 1`;
  return rows.map((r) => r.value);
};

export async function getSessionFilters(): Promise<SessionFilters> {
  const prisma = getPrisma();

  const [perDay, perFormat, rooms, tracks, levels, languages, tags, badges, speakers] = await Promise.all([
    prisma.session.groupBy({
      by: ['day'],
      _count: { _all: true },
      _min: { startsAt: true },
      _max: { endsAt: true },
      orderBy: { day: 'asc' },
    }),
    prisma.session.groupBy({ by: ['format'], _count: { _all: true }, orderBy: { format: 'asc' } }),
    distinctText('room'),
    distinctText('track'),
    distinctText('level'),
    distinctText('language'),
    storedTags(() => true),
    storedBadges(),
    prisma.speaker.count(),
  ]);

  return {
    timezone: env.EVENT_TIMEZONE,
    days: perDay.flatMap((g) => {
      if (!g.day) return [];
      const day = isoDay(g.day);
      return [
        {
          day,
          dayName: dayName(day),
          sessions: g._count._all,
          firstStart: localTime(g._min.startsAt),
          lastEnd: localTime(g._max.endsAt),
        },
      ];
    }),
    rooms,
    tracks,
    formats: perFormat.map((g) => ({ format: g.format, sessions: g._count._all })),
    levels,
    languages,
    tags: tags.sort((a, b) => a.localeCompare(b)),
    badges,
    speakers,
    totalSessions: perDay.reduce((sum, g) => sum + g._count._all, 0),
    unscheduledSessions: perDay.find((g) => g.day === null)?._count._all ?? 0,
  };
}
