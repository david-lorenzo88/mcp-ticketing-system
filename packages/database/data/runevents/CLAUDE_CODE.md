# Baltic Summit 2026 agenda → PostgreSQL

Import package for a Claude Code session. Everything here is tested against PostgreSQL 16: fresh install, upgrade of a v1 database,
and loading twice to confirm the loader is idempotent (fresh and upgraded results are identical).

## Files

| File | Purpose |
|---|---|
| `baltic_summit_2026.json` | Normalized dataset (`schema_version: 2`): event, rooms, speakers (with profile + photo URL), sessions (with full descriptions), agenda items |
| `schema.sql` | DDL for schema `conference` (tables, constraints, full-text index, `v_agenda` and `v_session_card` views). Also upgrades a v1 database in place |
| `load.sql` | Idempotent psql loader (upserts on source ids; re-runnable) |

## Task for Claude Code

1. Run from this folder: `psql "$DATABASE_URL" -f schema.sql -f load.sql`
   The same command upgrades a database already loaded with v1 of this package: `schema.sql`
   adds the new speaker columns and replaces the views; `load.sql` fills them in.
2. Verify with the queries below; counts must match exactly.
3. If the target project uses an ORM or migration tool (Prisma, Drizzle, EF Core, Alembic…),
   translate `schema.sql` into a migration instead of running it raw, and port `load.sql`
   into a seed script that reads `baltic_summit_2026.json`. Keep the natural keys and
   constraints listed under "Conventions".

## Conventions

- Upsert keys: `event.slug`, `room(event_id, key)`, `speaker.key`,
  `session(event_id, source_id)`, `agenda_item(event_id, source_id)`.
  `source_id` = RunEvents id; internal `id` columns are identities (gaps are normal).
- Timestamps are `timestamptz`; JSON carries `+02:00` (Europe/Warsaw, CEST). Use
  `v_agenda` for local wall-clock times.
- Speakers are global (reusable across events). `name` is cleaned
  (`Julian Kusenberg`); `display_name` is as published (`Julian Kusenberg (MVP)`).
- `session_speaker.speaker_order` preserves the published order.
- Titles and descriptions are verbatim from the source (including typos and whitespace).
  Descriptions are plain text converted from the source HTML (line breaks kept).

## For the web app

- `v_session_card`: one row per session (53) with title, format, sold-out flag, description,
  start/end (UTC and Warsaw local), room, and `speakers` as a JSON array ordered as published:
  `{id, name, display_name, tagline, company, badges, photo_url}`.
- `v_agenda`: one row per agenda slot (68), now also with `speakers_json`.
- Speaker columns: `tagline` (headline as published; the source has no separate job-title
  field), `company`, `biography` (plain text), `badges` (`text[]`: MVP, MCT, Microsoft,
  Microsoft Global Community Regional Leader), `photo_url`.
- `photo_url` points to the RunEvents CDN
  (`https://cdn.runevents.net/speaker-profile-images/<image-id>`). All 59 load; square
  images, 220–512 px. They're hotlinked: if the event organiser removes them, they stop
  working, so consider downloading them into your own storage and rewriting `photo_url`.

## Derived fields (not in the source; set by the extraction)

- `session.format`: `workshop` if the slot is ≥ 4 h, otherwise `talk`; `NULL` if unscheduled.
- `session.is_sold_out`: title starts with `[Sold out]`.
- `agenda_item.block_kind`: `break` (Break, Coffee Break), `meal` (Lunch, Meal),
  `ceremony` (Welcome, Find Your Session, Let's come togethet to the auditorium,
  Closure + give aways), `panel` (Discussion Panel), `sponsor` (KTBNet).

## Data notes

- Tracks, levels and languages are not published for this event: every session's `labels`
  list is empty in the source, the agenda's "Filter by" panel has no options, and the
  session detail view shows only room, time and description. No columns were added for them.
- Coverage: tagline 42/59, company 48/59, biography 59/59 (Paulina Pałczyńska's is the
  literal text "TBD"; Manfred Koch's is only a LinkedIn URL), badges 23/59, photo 59/59.
  Some published text has typos (e.g. "Power Platfrom", "Specalist"); kept verbatim.

- One session exists in the source with no agenda slot:
  "What do agents REALLY cost? Agent examples, licenses and credit costs" (Rob Kuijpers).
  It is loaded into `session` with `format = NULL` and has no `agenda_item`.
- "Secure AI ready permissions for any scale" lists two speakers in the source data
  (Mateusz Olek, Adam Żaczek); the public agenda page shows only Adam Żaczek.
- Friday lunch is in Room A (Cinema) 12:30–13:40 and overlaps a 13:00–13:30 talk in
  Room C. Saturday Room E 14:00–14:43 is as published.

## Verification

```sql
SET search_path = conference;
SELECT (SELECT count(*) FROM event)           AS events,        -- 1
       (SELECT count(*) FROM room)            AS rooms,         -- 7
       (SELECT count(*) FROM speaker)         AS speakers,      -- 59
       (SELECT count(*) FROM session)         AS sessions,      -- 53
       (SELECT count(*) FROM session_speaker) AS links,         -- 67
       (SELECT count(*) FROM agenda_item)     AS agenda_items;  -- 68

SELECT count(*) AS speakers, count(photo_url) AS photos, count(tagline) AS taglines,
       count(company) AS companies, count(biography) AS bios,
       count(*) FILTER (WHERE badges <> '{}') AS with_badges FROM speaker;
-- 59 | 59 | 42 | 48 | 59 | 23

SELECT day, count(*) FROM v_agenda GROUP BY 1 ORDER BY 1;
-- 2026-09-24 | 5,  2026-09-25 | 32,  2026-09-26 | 31

-- Full-text search example
SELECT title FROM session WHERE search @@ websearch_to_tsquery('english', 'voice agents');
```

## Provenance

- Page: https://balticsummit.pl/sessions2026 (RunEvents embed)
- API (public, no auth), `eventSlug=baltic-summit-2026`:
  - `https://api.runevents.net/api/agenda/external-agenda`
  - `https://api.runevents.net/api/sessions-and-speakers/external-sessions`
  - `https://api.runevents.net/api/agenda/external-agenda-non-content-blocks`
  - `https://api.runevents.net/api/sessions-and-speakers/external-speakers`
- Extracted 2026-09-23. Re-running the extraction against these endpoints and
  rebuilding the JSON in the same shape refreshes the data; `load.sql` updates in place.
