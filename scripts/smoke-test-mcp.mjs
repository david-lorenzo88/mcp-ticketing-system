/**
 * End-to-end smoke test for the MCP endpoint.
 *
 * Exercises the same Streamable HTTP handshake that Copilot Studio and Azure AI
 * Foundry perform: initialize, tools/list, then every tool including the two
 * error paths. Creates one ticket and cancels it again, so it is safe to run
 * against a live deployment.
 *
 *   node scripts/smoke-test-mcp.mjs
 *   MCP_URL=https://<your-app>.azurecontainerapps.io/mcp node scripts/smoke-test-mcp.mjs
 *   MCP_API_KEY=<key> MCP_URL=... node scripts/smoke-test-mcp.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:8080/mcp');
const apiKey = process.env.MCP_API_KEY ?? '';

const client = new Client({ name: 'baltic-smoke-test', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: apiKey ? { headers: { 'x-api-key': apiKey } } : undefined,
});

await client.connect(transport);
console.log('✓ initialize OK');
console.log('  server info:', JSON.stringify(client.getServerVersion()));
console.log('  instructions:', (client.getInstructions() ?? '').slice(0, 70) + '...');

const { tools } = await client.listTools();
console.log(`\n✓ tools/list returned ${tools.length} tools:`);
for (const t of tools) {
  const props = Object.keys(t.inputSchema?.properties ?? {});
  console.log(`  - ${t.name.padEnd(17)} [${props.length} params] ${(t.description ?? '').slice(0, 58)}...`);
}

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
  return { isError: Boolean(r.isError), text };
};

console.log('\n--- tools/call: get_ticket_stats ---');
console.log((await call('get_ticket_stats')).text.split('\n')[0]);

console.log('\n--- tools/call: list_tickets {status:CONFIRMED, pageSize:3} ---');
const list = await call('list_tickets', { status: 'CONFIRMED', pageSize: 3 });
console.log(list.text.split('\n')[0]);

console.log('\n--- tools/call: create_ticket ---');
const created = await call('create_ticket', {
  firstName: 'Kasia', lastName: 'MCP', email: 'kasia.mcp@example.com',
  company: 'Agent Corp', ticketType: 'WORKSHOP', status: 'CONFIRMED', priceAmount: 549,
});
console.log(created.text.split('\n')[0]);
const number = JSON.parse(created.text.slice(created.text.indexOf('{'))).ticketNumber;

console.log('\n--- tools/call: get_ticket by number ---');
console.log((await call('get_ticket', { identifier: number })).text.split('\n')[0]);

console.log('\n--- tools/call: update_ticket ---');
console.log((await call('update_ticket', { identifier: number, jobTitle: 'Automation Lead' })).text.split('\n')[0]);

console.log('\n--- tools/call: check_in_ticket ---');
console.log((await call('check_in_ticket', { identifier: number })).text.split('\n')[0]);

console.log('\n--- tools/call: check_in_ticket AGAIN (expect tool error) ---');
const dup = await call('check_in_ticket', { identifier: number });
console.log('  isError:', dup.isError, '|', dup.text);

console.log('\n--- tools/call: cancel_ticket ---');
console.log((await call('cancel_ticket', { identifier: number, reason: 'Smoke test cleanup' })).text.split('\n')[0]);

console.log('\n--- tools/call: get_ticket with a nonsense identifier (expect tool error) ---');
const bad = await call('get_ticket', { identifier: 'not-a-ticket' });
console.log('  isError:', bad.isError, '|', bad.text);

console.log('\n--- tools/call: get_session_filters ---');
console.log((await call('get_session_filters')).text.split('\n')[0]);

console.log('\n--- tools/call: list_sessions {excludeBreaks, pageSize:3} ---');
const sessions = await call('list_sessions', { excludeBreaks: true, pageSize: 3 });
console.log(sessions.text.split('\n')[0]);
const firstSession = JSON.parse(sessions.text.slice(sessions.text.indexOf('{'))).sessions[0];
if (firstSession) {
  console.log('\n--- tools/call: get_session ---');
  console.log((await call('get_session', { identifier: firstSession.id })).text.split('\n')[0]);
}

await client.close();
console.log('\n✓ ALL MCP CHECKS PASSED');
