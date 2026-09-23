# Baltic Summit — Ticketing & Admission

Ticketing system for Baltic Summit admission, with an **MCP server** so Copilot
Studio and Azure AI Foundry agents can manage tickets conversationally, a
**PostgreSQL** database, and a **minimalist web UI** for the organising team.

```
                          ┌──────────────────────────────┐
  Copilot Studio ───────► │                              │
                          │   Azure Container App        │
  Azure AI Foundry ─────► │                              │ ──► Azure Database
                          │   POST /mcp    MCP server    │     for PostgreSQL
  Organisers (browser) ─► │   /api/tickets REST API      │     (Flexible Server)
                          │   /           React SPA      │
                          └──────────────────────────────┘
```

One container serves all three surfaces, so there is a single thing to deploy,
scale and monitor. The MCP tools and the REST API call the same service layer,
so an agent and a human cannot get different behaviour out of the same action.

---

## What you get

| Piece | Details |
| --- | --- |
| **MCP server** | Streamable HTTP at `POST /mcp`, stateless, 10 tools — tickets and the conference agenda |
| **Database** | PostgreSQL 16 via Prisma 7 (driver adapters, no query engine binary) |
| **Web UI** | React 19 + Vite + Tailwind CSS v4 — tickets (list, create, edit, cancel, check in) and the session agenda (browse, filter, details) |
| **REST API** | `/api/tickets` — the same operations over plain HTTP |
| **Infrastructure** | Bicep for Container Apps, PostgreSQL, Log Analytics and ACR |
| **Agent guides** | [Copilot Studio](docs/copilot-studio.md) · [Azure AI Foundry](docs/azure-ai-foundry.md) |
| **Agent prompt** | [Ready-made Copilot Studio instructions](docs/copilot-studio-agent-instructions.md) |

---

## Quick start (local)

Requires Node.js 22+ and a PostgreSQL 16+ database.

```bash
git clone <this-repo> && cd mcp-ticketing-system
npm install

cp .env.example .env          # the defaults match the docker compose database
docker compose up -d db       # or point DATABASE_URL at any PostgreSQL

npm run db:migrate            # create the schema
npm run db:seed               # add 8 sample tickets (optional)
npm run build

npm start                     # http://localhost:8080
```

`npm start` serves the UI, the REST API and the MCP endpoint together. While
developing the frontend, run the two sides separately so you get hot reload:

```bash
npm run dev:server            # API + MCP on :8080
npm run dev:web               # Vite on :5173, proxying /api to :8080
```

Check the MCP endpoint end to end at any time:

```bash
node scripts/smoke-test-mcp.mjs
```

---

## Deploy to Azure

```bash
az login
./scripts/deploy-azure.sh
```

The script creates a resource group, a container registry, builds the image
**inside Azure** with `az acr build` (no local Docker needed), provisions
PostgreSQL Flexible Server and a Container App, and prints the URLs:

```
  Web UI        https://balticsummit-tickets.<region>.azurecontainerapps.io
  MCP endpoint  https://balticsummit-tickets.<region>.azurecontainerapps.io/mcp
```

Override anything with environment variables:

```bash
RESOURCE_GROUP=rg-baltic LOCATION=polandcentral \
MCP_API_KEY=generate \
./scripts/deploy-azure.sh
```

`MCP_API_KEY=generate` creates a 32-byte key, stores it as a Container App
secret and prints it once at the end — so the secret never lands in your shell
history. Pass a literal value instead if you already have one, or leave the
variable unset to deploy with the MCP endpoint open.

Before building anything the script registers the resource providers the
deployment needs (`Microsoft.App`, `Microsoft.ContainerRegistry`,
`Microsoft.DBforPostgreSQL`, `Microsoft.OperationalInsights`) — fresh
subscriptions often have these unregistered — and checks which PostgreSQL
versions and SKUs the region actually offers, adapting if the defaults are not
available. Override them with `PG_VERSION`, `PG_SKU` and `PG_TIER` if you need
a particular shape. If the region offers no PostgreSQL capacity at all, it says
so and stops before the image build rather than minutes later.

Migrations run automatically when the container starts (`prisma migrate deploy`
behind a Postgres advisory lock, so parallel replicas are safe). Set
`RUN_MIGRATIONS=false` to take that over yourself.

Rough cost at the defaults: a Burstable **B1ms** PostgreSQL server plus one
always-on 0.5 vCPU Container App replica. Setting `minReplicas=0` in
`infra/main.bicep` is cheaper but gives agents a cold start on the first MCP
call — usually the wrong trade for a tool an agent calls interactively.

### Connect your agents

- **Copilot Studio** → [docs/copilot-studio.md](docs/copilot-studio.md)
- **Azure AI Foundry** → [docs/azure-ai-foundry.md](docs/azure-ai-foundry.md)
- **Agent instructions to paste in** →
  [docs/copilot-studio-agent-instructions.md](docs/copilot-studio-agent-instructions.md)

Copilot Studio connector definitions are in
[`docs/connectors/`](docs/connectors/) — replace the `host:` line and import.

---

## MCP tools

| Tool | Kind | Description |
| --- | --- | --- |
| `list_tickets` | read | Search and page; filter by status and ticket type |
| `get_ticket` | read | One ticket by UUID **or** ticket number (`BS26-00042`) |
| `create_ticket` | write | Register an attendee and issue a ticket |
| `update_ticket` | write | Change details — only the fields you pass |
| `cancel_ticket` | destructive | Cancel with an optional reason (soft, auditable) |
| `check_in_ticket` | write | Admit an attendee at the door |
| `get_ticket_stats` | read | Totals by status and type, admissions, revenue |
| `list_sessions` | read | Agenda by day and time; filter by day, time window, room, track, format, level, language, tag, speaker, speaker badge (MVP, MCT…) or free text |
| `get_session` | read | One session in full — description, speaker profiles (photo, company, tagline, badges, bio), and what else runs at the same time |
| `get_session_filters` | read | Days, rooms, tracks, formats, levels, languages and tags available to filter on |

Anywhere a tool asks for an identifier it accepts a UUID or a printed ticket
number, so an agent can work from whatever the user says. Failures come back as
MCP tool errors with a readable message ("Ticket BS26-00042 was already checked
in at …"), which an agent can relay or recover from, rather than as transport
faults that abort its turn.

## REST API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/tickets` | List. `?search=&status=&ticketType=&page=&pageSize=&sortBy=&sortOrder=` |
| `GET` | `/api/tickets/stats` | Aggregate statistics |
| `GET` | `/api/tickets/:id` | One ticket — UUID or ticket number |
| `POST` | `/api/tickets` | Create |
| `PATCH` | `/api/tickets/:id` | Partial update |
| `POST` | `/api/tickets/:id/cancel` | Cancel — body `{ "reason": "…" }` |
| `POST` | `/api/tickets/:id/check-in` | Check in |
| `GET` | `/api/sessions` | Agenda. `?day=&search=&speaker=&badge=&room=&track=&format=&level=&language=&tag=&from=&to=&excludeBreaks=&page=&pageSize=` |
| `GET` | `/api/sessions/filters` | Days, rooms, tracks, formats, levels, languages and tags |
| `GET` | `/api/sessions/:id` | One session — UUID, agenda id or exact title |
| `GET` | `/healthz` · `/readyz` | Liveness · readiness (readiness pings the database) |

`status` and `ticketType` accept a single value, a comma-separated list, or a
repeated query parameter.

## Data model

One `tickets` table. Ticket numbers are **derived**, not stored: the table has an
autoincrementing `reference`, and the API renders it with the `TICKET_PREFIX`
env var (`42` → `BS26-00042`). That way a number can never drift from its row,
and changing the prefix between events needs no data migration.

**Ticket types** — `FULL_PASS`, `CONFERENCE`, `WORKSHOP`, `SPEAKER`, `SPONSOR`,
`VOLUNTEER`, `STUDENT`.

**Statuses** — `RESERVED` → `CONFIRMED` → `CHECKED_IN`, with `CANCELLED` reachable
from any of them. Cancelling is a soft delete: the row stays for audit, keeps its
reason and timestamp, and can be reinstated.

**Agenda** — `sessions`, `speakers` and a `session_speakers` join table (a
session can have several speakers, a speaker several sessions). Each session
keeps its full description, day, start/end (stored in UTC, shown and filtered in
`EVENT_TIMEZONE`), room, format, track, level, language and tags. The agenda is
loaded from a JSON export of https://balticsummit.pl/sessions2026 with
`npm run db:import-sessions`. The repo ships the full 2026 agenda. See [`packages/database/data/README.md`](packages/database/data/README.md)
for the file format and how to extract it.

See [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma).

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (**required**) |
| `PORT` | `8080` | HTTP port |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `TICKET_PREFIX` | `BS26` | Prefix for printed ticket numbers |
| `EVENT_TIMEZONE` | `Europe/Warsaw` | Timezone agenda times are shown and filtered in |
| `CORS_ORIGINS` | `*` | Comma-separated origins, or `*` |
| `MCP_API_KEY` | *(empty)* | Optional shared secret for `/mcp` only; empty = open |
| `MCP_JSON_RESPONSE` | `true` | JSON responses instead of SSE on `/mcp` |
| `PUBLIC_BASE_URL` | *(empty)* | Public URL, used in logs and `/healthz` |
| `WEB_DIST_PATH` | *(auto)* | Override where the built SPA is served from |
| `RUN_MIGRATIONS` | `true` | Run `prisma migrate deploy` on container start |

Invalid configuration fails fast at startup with a message naming the variable.

---

## Two things to know

**The branding is a stand-in.** `balticsummit.pl` was unreachable from the build
environment (blocked by the network egress policy), so the official logo and
colour values could not be read. The palette is a Baltic-Sea-inspired
approximation — deep harbour navy, sea azure, amber accent — and the logo is an
original mark drawn in those colours. Everything brand-related lives in exactly
two files, so swapping in the official assets is a small, contained change:

- [`apps/web/src/index.css`](apps/web/src/index.css) — the `@theme` block
- [`apps/web/src/components/Logo.tsx`](apps/web/src/components/Logo.tsx) — plus
  [`apps/web/public/favicon.svg`](apps/web/public/favicon.svg)

**There is no user authentication, by design.** You asked for none, so on a
public Container App the web UI and the REST API are open to anyone with the
URL — which means the internet.

`MCP_API_KEY` **only gates `POST /mcp`.** It deliberately does not cover
`/api/tickets` or the UI, because the browser SPA has nowhere safe to keep a
shared secret — shipping the key to the browser would publish it. So with
`MCP_API_KEY` set you get: agents must authenticate, but anyone who finds the
URL can still read and change the same data through the REST API. It raises the
bar for the agent surface; it does not protect the data.

To actually close the app off, in increasing order of effort:

1. Set `CORS_ORIGINS` to your own origin instead of `*`. Stops other websites
   calling the API from a visitor's browser; does not stop direct requests.
2. Put Entra ID in front of the whole app with
   [`az containerapp auth`](https://learn.microsoft.com/azure/container-apps/authentication).
   The platform handles sign-in before requests reach the container, so the UI
   and REST API are covered without any code change. Exclude `/mcp` from it and
   keep `MCP_API_KEY` for the agents, which cannot do an interactive sign-in.
3. Restrict Container App ingress to a VNet if the tooling is internal-only.

## Hardening the deployment

The registry uses admin credentials so the first deploy works with plain
Contributor rights. To switch to a managed identity instead: set
`adminUserEnabled: false` in `infra/registry.bicep`, give the Container App a
system-assigned identity, grant it `AcrPull` on the registry, and replace the
`registries[]` entry's `passwordSecretRef` with `identity: 'system'`.

---

## Project layout

```
.
├── apps/
│   ├── server/              Express: REST API + MCP server + serves the SPA
│   │   └── src/
│   │       ├── mcp/         MCP server definition and Streamable HTTP endpoint
│   │       ├── tickets/     zod schemas, service layer, REST routes
│   │       └── lib/         ticket numbers, error types
│   └── web/                 React 19 + Vite + Tailwind v4 SPA
├── packages/
│   └── database/            Prisma schema, migrations, seed, client singleton
├── infra/
│   ├── registry.bicep       Container registry (deployed first)
│   └── main.bicep           PostgreSQL, Container Apps environment, the app
├── scripts/
│   ├── deploy-azure.sh      One-command deployment
│   ├── docker-entrypoint.sh Migrate, then serve
│   └── smoke-test-mcp.mjs   End-to-end MCP check against any deployment
└── docs/
    ├── copilot-studio.md
    ├── azure-ai-foundry.md
    └── connectors/          Copilot Studio connector definitions
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev:server` / `npm run dev:web` | Development with reload |
| `npm run build` | Build database client, SPA and server |
| `npm start` | Run the production build |
| `npm test` | Unit tests (`vitest`) |
| `npm run typecheck` | Typecheck every workspace |
| `python3 scripts/verify-container-layout.py . /tmp/stages` | Replay the Dockerfile's stages without a Docker daemon |
| `npm run db:migrate` / `db:deploy` | Create / apply migrations |
| `npm run db:seed` | Insert sample tickets |
| `npm run db:import-sessions [-- file.json] [--prune]` | Load the conference agenda (upserts; `--prune` removes dropped sessions) |
| `npm run db:studio` | Prisma Studio |
