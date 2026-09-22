# Connecting the ticketing MCP server to Microsoft Copilot Studio

The server speaks **MCP over Streamable HTTP** at a single endpoint:

```
POST https://<your-host>/mcp
```

`scripts/deploy-azure.sh` prints this URL and the bare host name when the
deployment finishes.

Copilot Studio reaches MCP servers through a **custom connector**. What makes a
connector an MCP connector rather than an ordinary REST one is the
`x-ms-agentic-protocol: mcp-streamable-1.0` extension on the POST operation —
Copilot Studio then performs the MCP handshake itself and discovers the seven
tools automatically. You never list individual tools in the connector.

---

## Option A — the built-in MCP wizard (recommended)

1. Open your agent in [Copilot Studio](https://copilotstudio.microsoft.com).
2. Go to **Tools** → **+ Add a tool** → **New tool** → **Model Context Protocol**.
3. Fill in:

   | Field | Value |
   | --- | --- |
   | Server name | `Baltic Summit Ticketing` |
   | Server description | `Ticketing and admission for the Baltic Summit conference.` |
   | Server URL | `https://<your-host>/mcp` |
   | Authentication | **No authentication** (or **API key** — see below) |

4. Select **Create**. Copilot Studio builds the connector, connects, and lists
   the discovered tools.
5. Select **Add to agent**.

## Option B — import the connector definition

Use this when you want the connector defined in source control, or when the
wizard is not available in your environment.

1. Open [Power Apps](https://make.powerapps.com) and pick the same environment
   as your agent.
2. **Custom connectors** → **+ New custom connector** → **Import an OpenAPI file**.
3. Upload `docs/connectors/baltic-summit-mcp.swagger.yaml` — **first replace the
   `host:` line** with your deployed host name (no `https://`, no trailing slash).
   If you set `MCP_API_KEY`, upload `baltic-summit-mcp-apikey.swagger.yaml` instead.
4. **Create connector**, then open the **Test** tab and create a connection.
5. Back in Copilot Studio: **Tools** → **+ Add a tool** → **Model Context
   Protocol** → pick the connector you just created.

---

## Authentication

By default the server runs with **no authentication**, so choose *No
authentication* in the wizard. That also means anyone who learns the URL can
read and change ticket data.

To put a shared secret in front of it without introducing user accounts, set the
`MCP_API_KEY` environment variable on the Container App:

```bash
az containerapp secret set \
  --name balticsummit-tickets --resource-group rg-baltic-summit-tickets \
  --secrets mcp-api-key=<your-long-random-key>

az containerapp update \
  --name balticsummit-tickets --resource-group rg-baltic-summit-tickets \
  --set-env-vars MCP_API_KEY=secretref:mcp-api-key
```

Then choose **API Key** authentication in Copilot Studio with header name
`x-api-key`. The server also accepts `Authorization: Bearer <key>`.

---

## The tools your agent gets

| Tool | What it does |
| --- | --- |
| `list_tickets` | Search and page through tickets; filter by status and type |
| `get_ticket` | Fetch one ticket by UUID or ticket number (`BS26-00042`) |
| `create_ticket` | Register an attendee and issue a ticket |
| `update_ticket` | Change attendee details, ticket type, price or notes |
| `cancel_ticket` | Cancel a ticket, with an optional reason |
| `check_in_ticket` | Admit an attendee at the door |
| `get_ticket_stats` | Totals by status and type, admissions, revenue |

Every tool accepts either a UUID or a printed ticket number wherever it asks for
an identifier, so an agent can work from whatever the user says.

## Prompts worth trying

- *"How many tickets have we sold, and how many people are already inside?"*
- *"Register Anna Nowak, anna@contoso.com from Contoso, on a full pass for 1299 PLN."*
- *"Find the ticket for anna@contoso.com and change it to a workshop pass."*
- *"Check in BS26-00042."*
- *"Cancel BS26-00017 — the attendee asked for a refund."*

---

## Troubleshooting

**The connector is created but no tools appear.**
Confirm the URL ends in `/mcp` and that the server answers. From your machine:

```bash
curl -sS -X POST https://<your-host>/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should get JSON listing seven tools. A `401` means `MCP_API_KEY` is set and
the connector is not sending it.

**Calls time out or the agent says the tool failed.**
Check the container logs and the readiness endpoint:

```bash
az containerapp logs show --name balticsummit-tickets \
  --resource-group rg-baltic-summit-tickets --follow
curl https://<your-host>/readyz
```

`{"status":"not-ready","database":"down"}` points at the database, not the MCP
layer — usually the PostgreSQL firewall rule or the connection string.

**A `405` on `GET /mcp`.** That is expected. The server is stateless and only
accepts `POST` on `/mcp`; MCP clients do not need the GET stream.
