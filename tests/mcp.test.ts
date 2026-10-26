import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApp } from "../src/server/app.ts";
import { createMcpServer } from "../src/server/mcp.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-mcp-"));
  const dir = join(root, "courses/ana-211/notes");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "tubules.md"),
    "---\ntitle: Tubules\nsummary: Sodium\n---\n\n# Tubules\n\nFiltered sodium is reabsorbed.\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function connect() {
  const { config, vault, indexer, questions, papers, runner } = createApp({
    config: { vaultPath: root, dbPath: ":memory:" },
  });
  await indexer.reindexAll();

  const server = createMcpServer(config, vault, questions, papers, runner);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return { client, server, vault };
}

describe("mcp content tools", () => {
  test("lists tools, reads, writes and searches notes", async () => {
    const { client, server } = await connect();

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toContain("list_courses");
    expect(names).toContain("read_note");
    expect(names).toContain("write_note");
    expect(names).toContain("search_notes");
    expect(names).toContain("get_index");
    expect(names).toContain("list_assets");

    const read = await client.callTool({
      name: "read_note",
      arguments: { path: "courses/ana-211/notes/tubules.md" },
    });
    expect(text(read)).toContain("Filtered sodium");

    const write = await client.callTool({
      name: "write_note",
      arguments: {
        path: "courses/ana-211/notes/new.md",
        content: "---\ntitle: New\n---\n\n# New\n\nMacula densa cells sense chloride.\n",
        mode: "create",
        request_id: "req-1",
      },
    });
    expect(write.isError).not.toBe(true);

    const again = await client.callTool({
      name: "write_note",
      arguments: {
        path: "courses/ana-211/notes/new.md",
        content: "---\ntitle: New\n---\n\nDifferent body.\n",
        mode: "create",
        request_id: "req-1",
      },
    });
    expect(again.isError).not.toBe(true);

    const search = await client.callTool({
      name: "search_notes",
      arguments: { query: "chloride" },
    });
    expect(text(search)).toContain("new.md");

    const index = await client.callTool({ name: "get_index", arguments: { course: "ana-211" } });
    expect(text(index)).toContain("ana-211");

    await server.close();
  });

  test("updates course frontmatter and serves notes as resources", async () => {
    const { client, server } = await connect();

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("update_course");

    const update = await client.callTool({
      name: "update_course",
      arguments: {
        course: "ana-211",
        title: "Anatomy 211",
        department: "anatomy",
        exam_date: "2026-12-01",
        request_id: "course-1",
      },
    });
    expect(update.isError).not.toBe(true);
    expect(text(update)).toContain("Anatomy 211");

    const courses = await client.callTool({ name: "list_courses", arguments: {} });
    expect(text(courses)).toContain("Anatomy 211");

    const resources = await client.listResources();
    const note = resources.resources.find((resource) => resource.uri.endsWith("tubules.md"));
    expect(note).toBeDefined();

    const read = await client.readResource({ uri: note!.uri });
    expect((read.contents[0] as { text: string }).text).toContain("Filtered sodium");

    await server.close();
  });

  test("exposes the question-bank tools end to end", async () => {
    const { client, server } = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    for (const name of [
      "add_questions",
      "list_questions",
      "get_question",
      "update_question",
      "verify_question",
      "import_past_paper",
      "create_paper",
      "list_papers",
      "get_paper",
      "get_attempt_results",
    ]) {
      expect(names).toContain(name);
    }

    const question = {
      id: "ana-211-mcp-01",
      type: "tf_multi",
      topics: ["renal"],
      marks: 5,
      stem: "Concerning the tubules:",
      statements: [
        { text: "Sodium is reabsorbed.", answer: true },
        { text: "No sodium moves.", answer: false },
        { text: "The tubule is in the kidney.", answer: true },
        { text: "The tubule is in the liver.", answer: false },
      ],
      cites: [
        {
          note: "ana-211/notes/tubules.md",
          anchor: "tubules",
          quote: "Filtered sodium is reabsorbed",
        },
      ],
    };

    const added = await client.callTool({
      name: "add_questions",
      arguments: { course: "ana-211", questions: [question] },
    });
    expect(added.isError).not.toBe(true);
    expect(text(added)).toContain("ana-211-mcp-01");

    const listed = await client.callTool({
      name: "list_questions",
      arguments: { course: "ana-211", verified: false },
    });
    expect(text(listed)).toContain("ana-211-mcp-01");

    const fetched = await client.callTool({
      name: "get_question",
      arguments: { id: "ana-211-mcp-01" },
    });
    expect(text(fetched)).toContain("Concerning the tubules");

    const updated = await client.callTool({
      name: "update_question",
      arguments: {
        id: "ana-211-mcp-01",
        question: { ...question, stem: "Updated tubule stem:" },
      },
    });
    expect(updated.isError).not.toBe(true);
    expect(text(updated)).toContain("Updated tubule stem");

    const verified = await client.callTool({
      name: "verify_question",
      arguments: { id: "ana-211-mcp-01" },
    });
    expect(text(verified)).toContain('"verified":true');

    const paper = await client.callTool({
      name: "create_paper",
      arguments: {
        course: "ana-211",
        title: "MCP paper",
        mode: "strict",
        blueprint: [{ section: "A", type: "tf_multi", count: 1, minutes: 5 }],
      },
    });
    expect(paper.isError).not.toBe(true);
    expect(text(paper)).toContain("MCP paper");

    const papers = await client.callTool({ name: "list_papers", arguments: {} });
    expect(text(papers)).toContain("MCP paper");

    const imported = await client.callTool({
      name: "import_past_paper",
      arguments: {
        course: "ana-211",
        source: "notes/tubules.md",
        title: "tubules-paper",
        questions: [{ ...question, id: undefined }],
        request_id: "paper-mcp-1",
      },
    });
    expect(imported.isError).not.toBe(true);
    expect(text(imported)).toContain("ana-211-tubules-paper-01");

    await server.close();
  });

  test("rejects traversal through MCP without writing", async () => {
    const { client, server } = await connect();
    const result = await client.callTool({
      name: "write_note",
      arguments: { path: "../escape.md", content: "---\ntitle: x\n---\n", mode: "create" },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("traversal");
    await server.close();
  });
});

function text(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((item) => item.text ?? "").join("\n");
}
