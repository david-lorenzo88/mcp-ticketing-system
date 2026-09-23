# Connecting the ticketing MCP server to Azure AI Foundry

Foundry Agent Service talks to MCP servers over **Streamable HTTP**, which is
exactly what this server exposes:

```
POST https://<your-host>/mcp
```

Unlike Copilot Studio, Foundry needs no connector definition — you give it the
URL and it discovers the tools.

---

## Option A — the Foundry portal

1. Open [Azure AI Foundry](https://ai.azure.com) and select your project.
2. Go to **Agents** and open (or create) the agent.
3. Under **Tools**, choose **+ Add** → **Model Context Protocol**.
4. Fill in:

   | Field | Value |
   | --- | --- |
   | Server label | `baltic_summit_tickets` |
   | Server URL | `https://<your-host>/mcp` |
   | Allowed tools | leave empty for all ten, or list the ones you want |

5. If you set `MCP_API_KEY`, add a custom header `x-api-key` with the key.
6. Save, then use the playground to try it.

## Option B — the SDK

```python
import os
from azure.ai.projects import AIProjectClient
from azure.ai.agents.models import McpTool
from azure.identity import DefaultAzureCredential

project = AIProjectClient(
    endpoint=os.environ["AZURE_AI_PROJECT_ENDPOINT"],
    credential=DefaultAzureCredential(),
)

mcp_tool = McpTool(
    server_label="baltic_summit_tickets",
    server_url="https://<your-host>/mcp",
    allowed_tools=[],           # empty = expose every tool the server offers
)

# Only needed when the deployment has MCP_API_KEY set.
if api_key := os.environ.get("MCP_API_KEY"):
    mcp_tool.update_headers("x-api-key", api_key)

# "never" lets the agent call the tools without a human approving each call.
# Keep the default ("always") while you are still testing, so you can watch
# exactly what the agent does before it writes to the database.
mcp_tool.set_approval_mode("never")

with project.agents as agents:
    agent = agents.create_agent(
        model="gpt-4o",
        name="baltic-summit-ticketing",
        instructions=(
            "You help the Baltic Summit team manage conference tickets. "
            "Use the ticketing tools to look up attendees, register new tickets, "
            "correct details, cancel tickets and check people in at the door. "
            "Always read the ticket number back to the user after a change."
        ),
        tools=mcp_tool.definitions,
    )
    print(f"Agent ready: {agent.id}")
```

> SDK surface names move between preview releases. If `McpTool` does not
> resolve, check the version of `azure-ai-agents` you have installed and the
> current [Foundry MCP tool documentation](https://learn.microsoft.com/azure/ai-foundry/agents/how-to/tools/model-context-protocol);
> the portal route above is the more stable one.

---

## Approval mode

Four of the ten tools change data — `create_ticket`, `update_ticket`,
`cancel_ticket` and `check_in_ticket`. The server advertises this through MCP
tool annotations (`readOnlyHint`, `destructiveHint`), and `cancel_ticket` is
marked destructive, so a Foundry agent configured with approvals will surface
those calls for confirmation while letting `list_tickets`, `get_ticket` and
`get_ticket_stats` run freely.

If you want an agent that can only report and never change anything, restrict
it at the source with `allowed_tools`:

```python
allowed_tools=["list_tickets", "get_ticket", "get_ticket_stats", "list_sessions", "get_session", "get_session_filters"]
```

---

## Network reachability

Foundry calls the endpoint from Azure's side, so the Container App's public
ingress is enough — nothing else to open. If you later restrict ingress to a
VNet, the Foundry project needs to sit in (or be peered with) that network.

Verify the endpoint is reachable and healthy before wiring it into an agent:

```bash
curl https://<your-host>/healthz
node scripts/smoke-test-mcp.mjs   # with MCP_URL set to your deployment
```

`scripts/smoke-test-mcp.mjs` performs the same handshake Foundry does and
exercises every tool, including the error paths:

```bash
MCP_URL=https://<your-host>/mcp node scripts/smoke-test-mcp.mjs
MCP_URL=https://<your-host>/mcp MCP_API_KEY=<key> node scripts/smoke-test-mcp.mjs
```
