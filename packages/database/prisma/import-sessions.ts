import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { disconnectPrisma, getPrisma, localToUtc, Prisma, SessionFormat } from '../src/index.js';

/**
 * Loads the Baltic Summit agenda into the `sessions`, `speakers` and
 * `session_speakers` tables.
 *
 *   npm run db:import-sessions                         # data/sessions2026.json
 *   npm run db:import-sessions -- path/to/file.json
 *   npm run db:import-sessions -- --prune              # also delete sessions missing from the file
 *
 * Sessions and speakers are upserted on their `id` from the file, so re-running
 * after the published agenda changes updates rows in place. The file format is
 * documented in data/README.md.
 */

interface SpeakerInput {
  id?: string;
  name: string;
  company?: string | null;
  jobTitle?: string | null;
  tagline?: string | null;
  badges?: string[] | null;
  bio?: string | null;
  photoUrl?: string | null;
  links?: Record<string, string> | null;
}

interface SessionInput {
  id: string;
  title: string;
  description?: string | null;
  day?: string | null; // YYYY-MM-DD; omit for a session without a slot yet
  start?: string | null; // HH:MM, local event time
  end?: string | null;
  room?: string | null;
  format?: string | null;
  track?: string | null;
  level?: string | null;
  language?: string | null;
  tags?: string[] | null;
  url?: string | null;
  partnerUrl?: string | null;
  speakers?: SpeakerInput[] | null;
}

interface AgendaFile {
  event?: string;
  source?: string;
  timezone?: string;
  sessions: SessionInput[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Maps whatever label the agenda uses ("Keynote", "Hands-on lab", …) to a format. */
function toSessionFormat(label: string | null | undefined): SessionFormat {
  const value = (label ?? '').toLowerCase();
  if (!value) return SessionFormat.TALK;
  if (value.includes('keynote')) return SessionFormat.KEYNOTE;
  if (/workshop|hands-on|lab|training|masterclass/.test(value)) return SessionFormat.WORKSHOP;
  if (/panel|discussion|round ?table|q&a/.test(value)) return SessionFormat.PANEL;
  if (/lightning|short/.test(value)) return SessionFormat.LIGHTNING;
  if (/break|lunch|coffee|registration|networking|party|dinner|opening|closing/.test(value)) {
    return SessionFormat.BREAK;
  }
  if (/talk|session|presentation|lecture|demo/.test(value)) return SessionFormat.TALK;
  return SessionFormat.OTHER;
}

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function validate(file: AgendaFile): string[] {
  const problems: string[] = [];
  if (!Array.isArray(file.sessions)) return ['"sessions" must be an array'];

  const seen = new Set<string>();
  file.sessions.forEach((s, i) => {
    const where = `sessions[${i}]${s?.id ? ` (${s.id})` : ''}`;
    if (!s?.id?.trim()) problems.push(`${where}: "id" is required`);
    else if (seen.has(s.id)) problems.push(`${where}: duplicate id`);
    else seen.add(s.id);
    if (!s?.title?.trim()) problems.push(`${where}: "title" is required`);
    if (s?.day && !DAY.test(s.day)) problems.push(`${where}: "day" must be YYYY-MM-DD`);
    if (!s?.day && (s?.start || s?.end)) problems.push(`${where}: "start"/"end" need a "day"`);
    if (s?.start && !TIME.test(s.start)) problems.push(`${where}: "start" must be HH:MM`);
    if (s?.end && !TIME.test(s.end)) problems.push(`${where}: "end" must be HH:MM`);
    s?.speakers?.forEach((sp, j) => {
      if (!sp?.name?.trim()) problems.push(`${where}.speakers[${j}]: "name" is required`);
    });
  });
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const prune = args.includes('--prune');
  const path = resolve(
    process.env.INIT_CWD ?? process.cwd(),
    args.find((a) => !a.startsWith('--')) ?? resolve(import.meta.dirname, '../data/sessions2026.json'),
  );

  if (!existsSync(path)) {
    console.error(
      `✗ ${path} does not exist. Export the agenda to that file first — see data/README.md.`,
    );
    process.exitCode = 1;
    return;
  }

  const file = JSON.parse(readFileSync(path, 'utf8')) as AgendaFile;
  const problems = validate(file);
  if (problems.length > 0) {
    console.error(`✗ ${path} is not a valid agenda file:\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
    return;
  }

  const timeZone = file.timezone ?? 'Europe/Warsaw';
  const prisma = getPrisma();

  // Speakers first, merged across sessions: the same person may appear on
  // several sessions and the richest record (e.g. the one with a bio) wins.
  const speakers = new Map<string, SpeakerInput>();
  for (const session of file.sessions) {
    for (const sp of session.speakers ?? []) {
      const key = sp.id?.trim() || slugify(sp.name);
      const prev = speakers.get(key);
      speakers.set(key, {
        ...prev,
        ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== null && v !== '')),
        name: sp.name.trim(),
      } as SpeakerInput);
    }
  }

  const speakerIds = new Map<string, string>();
  for (const [externalId, sp] of speakers) {
    const data = {
      fullName: sp.name,
      company: clean(sp.company),
      jobTitle: clean(sp.jobTitle),
      tagline: clean(sp.tagline),
      badges: (sp.badges ?? []).map((b) => b.trim()).filter(Boolean),
      bio: clean(sp.bio),
      photoUrl: clean(sp.photoUrl),
      links: sp.links && Object.keys(sp.links).length > 0 ? sp.links : Prisma.DbNull,
    };
    const row = await prisma.speaker.upsert({
      where: { externalId },
      create: { externalId, ...data },
      update: data,
    });
    speakerIds.set(externalId, row.id);
  }

  for (const s of file.sessions) {
    const data = {
      title: s.title.trim(),
      description: clean(s.description),
      day: s.day ? new Date(`${s.day}T00:00:00Z`) : null,
      startsAt: s.day && s.start ? localToUtc(s.day, s.start, timeZone) : null,
      endsAt: s.day && s.end ? localToUtc(s.day, s.end, timeZone) : null,
      room: clean(s.room),
      format: toSessionFormat(s.format),
      formatLabel: clean(s.format),
      track: clean(s.track),
      level: clean(s.level),
      language: clean(s.language),
      tags: (s.tags ?? []).map((t) => t.trim()).filter(Boolean),
      url: clean(s.url),
      partnerUrl: clean(s.partnerUrl),
    };

    const links = (s.speakers ?? []).map((sp, position) => ({
      speakerId: speakerIds.get(sp.id?.trim() || slugify(sp.name))!,
      position,
    }));

    await prisma.$transaction(async (tx) => {
      const session = await tx.session.upsert({
        where: { externalId: s.id },
        create: { externalId: s.id, ...data },
        update: data,
      });
      await tx.sessionSpeaker.deleteMany({ where: { sessionId: session.id } });
      if (links.length > 0) {
        await tx.sessionSpeaker.createMany({
          data: links.map((l) => ({ ...l, sessionId: session.id })),
        });
      }
    });
  }

  let pruned = 0;
  if (prune) {
    const ids = file.sessions.map((s) => s.id);
    pruned = (await prisma.session.deleteMany({ where: { externalId: { notIn: ids } } })).count;
    await prisma.speaker.deleteMany({ where: { sessions: { none: {} } } });
  }

  const days = [...new Set(file.sessions.flatMap((s) => (s.day ? [s.day] : [])))].sort();
  const unscheduled = file.sessions.filter((s) => !s.day).length;
  console.log(
    `✓ Imported ${file.sessions.length} session(s) and ${speakers.size} speaker(s) ` +
      `across ${days.length} day(s) (${days.join(', ')})` +
      (unscheduled ? ` plus ${unscheduled} without a slot yet` : '') +
      ` from ${path}` +
      (prune ? `; pruned ${pruned} session(s) no longer on the agenda.` : '.'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
