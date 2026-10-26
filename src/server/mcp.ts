import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Config } from "./config.ts";

const INSTRUCTIONS = `This server is the Exam Harness for a medical student.
The markdown vault is the source of truth; read INDEX.md before notes.
Teaching protocol: session_start, read the index, probe with activities, diagnose, teach, record evidence, session_end.
Never invent content without citations; unverified content must be marked unverified.
Exam simulations are deterministic and run without an agent.`;

export function createMcpServer(config: Config): McpServer {
  const server = new McpServer(
    { name: "exam-harness", version: config.version },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "get_server_info",
    {
      description: "Return harness version, vault path and MCP transport status.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            name: "exam-harness",
            version: config.version,
            vault: config.vaultPath,
            transport: "streamable-http",
            milestone: "M0",
          }),
        },
      ],
    }),
  );

  return server;
}

export async function handleMcpRequest(
  request: Request,
  config: Config,
): Promise<Response> {
  const server = createMcpServer(config);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: null },
      { status: 500 },
    );
  } finally {
    await server.close().catch(() => {});
  }
}
