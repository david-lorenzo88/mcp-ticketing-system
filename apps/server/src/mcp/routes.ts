import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router, type Request, type Response } from 'express';
import { env } from '../env.js';
import { createMcpServer } from './server.js';

export const mcpRouter: Router = Router();

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Optional shared-secret gate.
 *
 * With MCP_API_KEY unset (the default) the endpoint is completely open, which
 * is what an unauthenticated deployment wants. When it is set, agents must send
 * the value as `Authorization: Bearer <key>` or `x-api-key: <key>` — both are
 * expressible in a Copilot Studio custom connector and in Foundry's MCP tool.
 */
function isAuthorized(req: Request): boolean {
  if (!env.MCP_API_KEY) return true;

  const authorization = req.header('authorization') ?? '';
  const bearer = /^bearer\s+/i.test(authorization)
    ? authorization.replace(/^bearer\s+/i, '').trim()
    : '';
  const presented = req.header('x-api-key')?.trim() || bearer;

  return Boolean(presented) && constantTimeEquals(presented, env.MCP_API_KEY);
}

/** JSON-RPC shaped error, which is what an MCP client expects to receive. */
function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

mcpRouter.post('/', async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    jsonRpcError(res, 401, -32001, 'Unauthorized: a valid API key is required.');
    return;
  }

  // A new server + transport per request keeps the endpoint stateless, so it
  // survives Container Apps scaling out and recycling replicas.
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: env.MCP_JSON_RESPONSE,
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp] request failed:', error);
    if (!res.headersSent) {
      jsonRpcError(res, 500, -32603, 'Internal server error handling the MCP request.');
    }
  }
});

// Stateless servers have no stream to resume and no session to delete. Answering
// 405 (rather than hanging) is what the Streamable HTTP spec asks for here.
const methodNotAllowed = (_req: Request, res: Response): void =>
  jsonRpcError(
    res,
    405,
    -32000,
    'This MCP server is stateless: only POST is supported on /mcp.',
  );

mcpRouter.get('/', methodNotAllowed);
mcpRouter.delete('/', methodNotAllowed);
