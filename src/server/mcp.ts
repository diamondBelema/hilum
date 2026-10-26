import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Config } from "./config.ts";
import type { VaultService } from "./vault/service.ts";

const INSTRUCTIONS = `This server is the Exam Harness for a medical student.
The markdown vault is the source of truth; read INDEX.md before notes.
Teaching protocol: session_start, read the index, probe with activities, diagnose, teach, record evidence, session_end.
Never invent content without citations; unverified content must be marked unverified.
Exam simulations are deterministic and run without an agent.`;

export function createMcpServer(config: Config, vault: VaultService): McpServer {
  const server = new McpServer(
    { name: "exam-harness", version: config.version },
    { instructions: INSTRUCTIONS },
  );

  const json = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  });

  const fail = (err: unknown) => ({
    content: [
      {
        type: "text" as const,
        text: err instanceof Error ? err.message : String(err),
      },
    ],
    isError: true,
  });

  server.registerTool(
    "get_server_info",
    { description: "Return harness version, vault path and index stats.", inputSchema: {} },
    async () =>
      json({
        name: "exam-harness",
        version: config.version,
        vault: config.vaultPath,
        transport: "streamable-http",
        stats: vault.stats(),
      }),
  );

  server.registerTool(
    "list_courses",
    { description: "List courses in the vault with note and token counts.", inputSchema: {} },
    async () => {
      try {
        return json(await vault.listCourses());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_index",
    {
      description: "Return the root INDEX.md, or a course INDEX.md when course is given.",
      inputSchema: { course: z.string().optional() },
    },
    async ({ course }) => {
      try {
        return json(vault.getIndex(course));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "read_note",
    {
      description: "Read a note by vault-relative path. Returns frontmatter and markdown body.",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      try {
        return json(vault.readNote(path));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "search_notes",
    {
      description: "Full-text search over indexed notes. Optional course filter.",
      inputSchema: {
        query: z.string(),
        course: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ query, course, limit }) => {
      try {
        return json(vault.search(query, course, limit));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "write_note",
    {
      description:
        "Write a markdown note inside the vault. Creates parent directories. Validates YAML frontmatter on create/replace.",
      inputSchema: {
        path: z.string(),
        content: z.string(),
        mode: z.enum(["create", "append", "replace"]).default("create"),
        request_id: z.string().optional(),
      },
    },
    async (input) => {
      try {
        return json(
          await vault.writeNote({
            path: input.path,
            content: input.content,
            mode: input.mode,
            requestId: input.request_id,
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_assets",
    {
      description: "List asset files for a course with sizes.",
      inputSchema: { course: z.string() },
    },
    async ({ course }) => {
      try {
        return json(await vault.listAssets(course));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "update_course",
    {
      description:
        "Update a course's course.md frontmatter (title, department, answer_style, exam_date, exam_blueprint). Omitted fields are kept; null clears a field.",
      inputSchema: {
        course: z.string(),
        title: z.string().nullish(),
        department: z.string().nullish(),
        answer_style: z.string().nullish(),
        exam_date: z.string().nullish(),
        exam_blueprint: z.array(z.record(z.unknown())).nullish(),
        request_id: z.string().optional(),
      },
    },
    async (input) => {
      try {
        return json(
          await vault.updateCourse(
            input.course,
            {
              title: input.title,
              department: input.department,
              answerStyle: input.answer_style,
              examDate: input.exam_date,
              examBlueprint: input.exam_blueprint,
            },
            input.request_id,
          ),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerResource(
    "vault-note",
    new ResourceTemplate("vault://{+path}", {
      list: async () => ({
        resources: vault.allNotes().map((note) => ({
          uri: `vault://${note.path}`,
          name: note.title,
          description: note.summary,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { description: "A markdown note from the vault", mimeType: "text/markdown" },
    async (uri, variables) => {
      const path = Array.isArray(variables.path) ? variables.path[0] : variables.path;
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: vault.readNoteRaw(String(path ?? "")),
          },
        ],
      };
    },
  );

  return server;
}

export async function handleMcpRequest(
  request: Request,
  config: Config,
  vault: VaultService,
): Promise<Response> {
  const server = createMcpServer(config, vault);
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
  }
}
