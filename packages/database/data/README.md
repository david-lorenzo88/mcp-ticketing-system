# Agenda data

`npm run db:import-sessions` loads `sessions2026.json` from this folder into the
`sessions`, `speakers` and `session_speakers` tables. It upserts on `id`, so
re-run it whenever the published agenda changes. Add `--prune` to also delete
sessions that are no longer in the file.

```bash
npm run db:import-sessions                                        # data/sessions2026.json
npm run db:import-sessions -- packages/database/data/sessions2026.example.json
DATABASE_URL="postgresql://…azure…?sslmode=require" npm run db:import-sessions -- --prune
```

`sessions2026.example.json` is **made-up placeholder data** for trying the MCP
tools locally. Don't import it into production.

## File format

```jsonc
{
  "event": "Baltic Summit 2026",
  "source": "https://balticsummit.pl/sessions2026",
  "timezone": "Europe/Warsaw",       // times below are local to this zone
  "sessions": [
    {
      "id": "stable-unique-id",      // required: slug or id from the site
      "title": "…",                  // required
      "description": "…",            // full text, paragraphs separated by \n\n
      "day": "2026-09-24",           // required, YYYY-MM-DD
      "start": "09:00",              // HH:MM, 24h
      "end": "09:45",
      "room": "Main Hall",
      "format": "Keynote",           // label as shown on the site (Keynote, Session, Workshop, Panel, Break…)
      "track": "Power Platform",
      "level": "Intermediate",
      "language": "English",
      "tags": ["Copilot", "Dataverse"],
      "url": "https://…",            // session detail page, if any
      "speakers": [
        {
          "id": "stable-speaker-id", // optional; defaults to a slug of the name
          "name": "Jane Doe",        // required
          "company": "…",
          "jobTitle": "…",
          "bio": "…",
          "photoUrl": "https://…",
          "links": { "linkedin": "https://…" }
        }
      ]
    }
  ]
}
```

Only `id`, `title` and `day` are required; leave out anything the site doesn't
show. `format` is mapped onto KEYNOTE / TALK / WORKSHOP / PANEL / LIGHTNING /
BREAK / OTHER, and the original label is kept alongside.

## Extracting the agenda with Claude in Chrome

Open https://balticsummit.pl/sessions2026 in Chrome and give the Claude
extension this prompt, then save its answer as `sessions2026.json` here:

> Extract every session on this page, for every day of the event (switch day
> tabs if there are any). For each session, open or expand it so you can read
> the full description and the full speaker details, including bios. Output
> one JSON document, and nothing else, in exactly this format:
> `{ "event": "Baltic Summit 2026", "source": "https://balticsummit.pl/sessions2026", "timezone": "Europe/Warsaw", "sessions": [ { "id", "title", "description", "day" (YYYY-MM-DD), "start" (HH:MM), "end" (HH:MM), "room", "format", "track", "level", "language", "tags" (array), "url", "speakers": [ { "id", "name", "company", "jobTitle", "bio", "photoUrl", "links" } ] } ] }`.
> Use the site's own session and speaker ids or URL slugs for "id" where there
> are any; otherwise make a slug from the title. Copy descriptions and bios
> word for word, keep paragraph breaks as \n\n, and include breaks such as
> registration, coffee and lunch with format "Break". Leave out fields the
> page doesn't show rather than guessing.

Then check the counts per day the importer prints against the site.
