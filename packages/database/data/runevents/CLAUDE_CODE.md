# Baltic Summit 2026 agenda → PostgreSQL

Import package for a Claude Code session. Everything here is tested against PostgreSQL 16
(loaded twice to confirm the loader is idempotent).

## Files

| File | Purpose |
|---|---|
| `baltic_summit_2026.json` | Normalized dataset: event, rooms, speakers, sessions (with full descriptions), agenda items |
| `schema.sql` | DDL for schema `conference` (tables, constraints, full-text index, `v_agenda` view) |
| `load.sql` | Idempotent psql loader (upserts on source ids; re-runnable) |

## Task for Claude Code

1. Run from this folder: `psql "$DATABASE_URL" -f schema.sql -f load.sql`
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

## Derived fields (not in the source; set by the extraction)

- `session.format`: `workshop` if the slot is ≥ 4 h, otherwise `talk`; `NULL` if unscheduled.
- `session.is_sold_out`: title starts with `[Sold out]`.
- `agenda_item.block_kind`: `break` (Break, Coffee Break), `meal` (Lunch, Meal),
  `ceremony` (Welcome, Find Your Session, Let's come togethet to the auditorium,
  Closure + give aways), `panel` (Discussion Panel), `sponsor` (KTBNet).

## Data notes

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
- Extracted 2026-09-23. Re-running the extraction against these endpoints and
  rebuilding the JSON in the same shape refreshes the data; `load.sql` updates in place.
