/**
 * Converts a RunEvents agenda export (the normalized `baltic_summit_2026.json`
 * produced from https://balticsummit.pl/sessions2026) into the format read by
 * `npm run db:import-sessions` (see packages/database/data/README.md).
 *
 *   node scripts/convert-runevents-agenda.mjs \
 *     packages/database/data/runevents/baltic_summit_2026.json \
 *     packages/database/data/sessions2026.json
 *
 * Mapping:
 * - every session becomes one agenda session with id `runevents-session-<id>`,
 *   placed by its agenda slot; a session with no slot keeps no day or time;
 * - every non-content block (breaks, meals, welcome, panel, sponsor slot)
 *   becomes a session with id `runevents-block-<agenda slot id>`;
 * - `is_sold_out` and `partner_url` become the "Sold out" / "Partner session"
 *   tags, and `partner_url` is kept as `partnerUrl`;
 * - speaker profiles (schema_version 2) carry over tagline, company, badges,
 *   photo and biography. A placeholder biography ("TBD") is dropped, and one
 *   that is only a URL becomes a profile link instead.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/convert-runevents-agenda.mjs <runevents.json> <sessions.json>');
  process.exit(1);
}

const src = JSON.parse(readFileSync(input, 'utf8'));
const timeZone = src.event.time_zone;

const localParts = (iso) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

const rooms = new Map(src.rooms.map((r) => [r.key, r.name]));
const speakers = new Map(src.speakers.map((p) => [p.key, p]));

const PLACEHOLDER_BIO = /^(tbd|tba|n\/a|-)$/i;
const ONLY_URL = /^https?:\/\/\S+$/i;

/** Profile fields for one speaker; everything but the name is optional. */
function speakerProfile(p) {
  const bio = p.biography?.trim() ?? '';
  const links = {};
  let biography = bio || undefined;
  if (PLACEHOLDER_BIO.test(bio)) biography = undefined;
  if (ONLY_URL.test(bio)) {
    links[/linkedin\.com/i.test(bio) ? 'linkedin' : 'website'] = bio;
    biography = undefined;
  }
  return {
    id: p.key,
    name: p.name,
    ...(p.tagline ? { tagline: p.tagline } : {}),
    ...(p.company ? { company: p.company } : {}),
    ...(p.badges?.length ? { badges: p.badges } : {}),
    ...(biography ? { bio: biography } : {}),
    ...(p.photo_url ? { photoUrl: p.photo_url } : {}),
    ...(Object.keys(links).length ? { links } : {}),
  };
}

const slot = (item) => {
  const start = localParts(item.starts_at);
  const end = localParts(item.ends_at);
  if (start.day !== end.day) throw new Error(`Agenda item ${item.source_id} spans two days`);
  const room = rooms.get(item.room);
  if (!room) throw new Error(`Agenda item ${item.source_id} uses unknown room "${item.room}"`);
  return { day: start.day, start: start.time, end: end.time, room };
};

const sessionSlots = new Map();
for (const item of src.agenda_items) {
  if (item.item_type !== 'session') continue;
  if (sessionSlots.has(item.session_source_id)) {
    throw new Error(`Session ${item.session_source_id} has more than one agenda slot`);
  }
  sessionSlots.set(item.session_source_id, slot(item));
}

const FORMAT_LABELS = { talk: 'Talk', workshop: 'Workshop' };
const BLOCK_LABELS = {
  break: 'Break',
  meal: 'Meal break',
  ceremony: 'Ceremony',
  panel: 'Panel discussion',
  sponsor: 'Sponsor slot',
};

const sessions = [];

for (const s of src.sessions) {
  const tags = [
    ...(s.is_sold_out ? ['Sold out'] : []),
    ...(s.partner_url ? ['Partner session'] : []),
  ];
  sessions.push({
    id: `runevents-session-${s.source_id}`,
    title: s.title,
    description: s.description,
    ...(sessionSlots.get(s.source_id) ?? {}),
    ...(s.format ? { format: FORMAT_LABELS[s.format] ?? s.format } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    url: src.source.page,
    ...(s.partner_url ? { partnerUrl: s.partner_url } : {}),
    speakers: s.speakers.map((key) => {
      const p = speakers.get(key);
      if (!p) throw new Error(`Session ${s.source_id} references unknown speaker "${key}"`);
      return speakerProfile(p);
    }),
  });
}

for (const item of src.agenda_items) {
  if (item.item_type !== 'block') continue;
  sessions.push({
    id: `runevents-block-${item.source_id}`,
    title: item.block_title,
    ...slot(item),
    format: BLOCK_LABELS[item.block_kind] ?? item.block_kind,
  });
}

sessions.sort((a, b) =>
  `${a.day ?? '9999'} ${a.start ?? ''} ${a.room ?? ''}`.localeCompare(
    `${b.day ?? '9999'} ${b.start ?? ''} ${b.room ?? ''}`,
  ),
);

writeFileSync(
  output,
  `${JSON.stringify(
    {
      event: src.event.name,
      source: src.source.page,
      extractedOn: src.source.extracted_on,
      timezone: timeZone,
      sessions,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `✓ Wrote ${sessions.length} agenda entries (${src.sessions.length} sessions, ` +
    `${sessions.length - src.sessions.length} breaks and other blocks) to ${output}`,
);
