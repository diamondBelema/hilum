import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../src/server/db.ts";
import { createApp } from "../src/server/app.ts";
import { createMcpServer } from "../src/server/mcp.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-wp2b-"));
  const dir = join(root, "courses/ana-211/notes");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "tubules.md"),
    "---\ntitle: Tubules\n---\n\n# Tubules {#tubules}\n\nFiltered sodium is reabsorbed.\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function connect() {
  const app = createApp({
    config: { vaultPath: root, dbPath: ":memory:" },
  });
  const { config, vault, indexer, questions, papers, runner, grading, sessions, concepts } = app;
  await indexer.reindexAll();

  const server = createMcpServer(config, vault, questions, papers, runner, grading, sessions, concepts);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return { client, server, vault, runner, sessions, app };
}

function text(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((item) => item.text ?? "").join("\n");
}

describe("agent message channel (WP2b)", () => {
  test("say persists and orders correctly with activities", async () => {
    const { client, server, sessions } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const pushed = await client.callTool({
      name: "push_activity",
      arguments: {
        session_id: sessionId,
        spec: {
          title: "Tubules probe",
          cites: [
            { note: "ana-211/notes/tubules.md", anchor: "tubules", quote: "Filtered sodium" },
          ],
          components: [{ type: "mcq_single", stem: "What?", options: ["A", "B"], answer: 0 }],
        },
      },
    });
    expect(pushed.isError).not.toBe(true);

    const said = await client.callTool({
      name: "say",
      arguments: {
        session_id: sessionId,
        text: "Here is the probe.",
        kind: "probe",
      },
    });
    expect(said.isError).not.toBe(true);
    const saidData = JSON.parse(text(said)) as { id: number; cites: unknown[]; unverified: boolean };
    expect(saidData.cites).toEqual([]);
    expect(saidData.unverified).toBe(false);

    const detail = await client.callTool({
      name: "get_session",
      arguments: { session_id: sessionId },
    });
    const detailData = JSON.parse(text(detail)) as { transcript: { kind: string; createdAt: number; data: unknown }[] };
    const kinds = detailData.transcript.map((item) => item.kind);
    expect(kinds).toContain("message");
    expect(kinds).toContain("activity");

    const msgItems = detailData.transcript.filter((item) => item.kind === "message");
    expect((msgItems[0] as { data: { text: string } }).data.text).toBe("Here is the probe.");

    await server.close();
  });

  test("text over 2000 chars is rejected with a message telling the agent to split", async () => {
    const { client, server } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const tooLong = "x".repeat(2001);
    const result = await client.callTool({
      name: "say",
      arguments: { session_id: sessionId, text: tooLong },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("2000 character");

    await server.close();
  });

  test("a bad cite writes nothing", async () => {
    const { client, server, sessions } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const bad = await client.callTool({
      name: "say",
      arguments: {
        session_id: sessionId,
        text: "Bad citation.",
        cites: [{ note: "ana-211/notes/nonexistent.md", anchor: "missing", quote: "nope" }],
      },
    });
    expect(bad.isError).toBe(true);

    const messages = sessions.messages(sessionId);
    expect(messages).toHaveLength(0);

    await server.close();
  });

  test("the unverified flag works", async () => {
    const { client, server } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const unverified = await client.callTool({
      name: "say",
      arguments: {
        session_id: sessionId,
        text: "Unverified claim.",
        unverified: true,
      },
    });
    expect(unverified.isError).not.toBe(true);
    const data = JSON.parse(text(unverified)) as { unverified: boolean };
    expect(data.unverified).toBe(true);

    await server.close();
  });

  test("say touches agent_seen_at and a student request does not", async () => {
    const { client, server, sessions } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const detail1 = JSON.parse(text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } }))) as { agentSeenAt: number | null };
    expect(detail1.agentSeenAt).toBeNull();

    const said = await client.callTool({
      name: "say",
      arguments: { session_id: sessionId, text: "Agent speaks." },
    });
    expect(said.isError).not.toBe(true);

    const detail2 = JSON.parse(text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } }))) as { agentSeenAt: number | null };
    expect(detail2.agentSeenAt).not.toBeNull();

    sessions.request(sessionId, "Student asks.");
    const detail3 = JSON.parse(text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } }))) as { agentSeenAt: number | null };
    expect(detail3.agentSeenAt).toEqual(detail2.agentSeenAt);

    await server.close();
  });

  test("the migration runs on a database that predates the table", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-migration-"));
    const dbPath = join(dir, "test.db");
    const db = openDb(dbPath);
    // Create old schema without cites_json/unverified columns
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'say',
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    db.close();

    const { app, sessions } = createApp({ config: { vaultPath: root, dbPath } });

    const started = await app.request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "ana-211", goal: "review" }),
    });
    expect(started.status).toBe(201);
    const startedBody = await started.text();
    const sessionId = JSON.parse(startedBody).id;

    const detail = await app.request(`/api/sessions/${sessionId}`);
    expect(detail.status).toBe(200);

    await app.request("/api/sessions/" + sessionId + "/end", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ summary: "done" }),
    });
    const detail2 = await app.request(`/api/sessions/${sessionId}`);
    expect(detail2.status).toBe(200);

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    // Re-open to confirm migration idempotency
    const db2 = openDb(dbPath);
    const cols = db2.query("PRAGMA table_info(agent_messages)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("cites_json");
    expect(names).toContain("unverified");
    db2.close();
  });

  test("transcript ordering with messages, requests and activities", async () => {
    const { client, server, sessions } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const pushed = await client.callTool({
      name: "push_activity",
      arguments: {
        session_id: sessionId,
        spec: {
          title: "Activity one",
          cites: [{ note: "ana-211/notes/tubules.md", anchor: "tubules", quote: "Filtered" }],
          components: [{ type: "confidence_rating" }],
        },
      },
    });
    expect(pushed.isError).not.toBe(true);
    await Bun.sleep(10);

    const said1 = await client.callTool({
      name: "say",
      arguments: { session_id: sessionId, text: "First message." },
    });
    expect(said1.isError).not.toBe(true);
    await Bun.sleep(10);

    sessions.request(sessionId, "Student question.");
    await Bun.sleep(10);

    const said2 = await client.callTool({
      name: "say",
      arguments: { session_id: sessionId, text: "Second message." },
    });
    expect(said2.isError).not.toBe(true);

    const detail = JSON.parse(text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } }))) as { transcript: { kind: string; createdAt: number }[] };
    const kinds = detail.transcript.map((item) => item.kind);
    expect(kinds[0]).toBe("activity");
    expect(kinds[1]).toBe("message");
    expect(kinds[2]).toBe("request");
    expect(kinds[3]).toBe("message");

    await server.close();
  });

  test("the session note contains agent messages", async () => {
    const { client, server, app } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const said = await client.callTool({
      name: "say",
      arguments: {
        session_id: sessionId,
        text: "Agent final word.",
        kind: "teach",
      },
    });
    expect(said.isError).not.toBe(true);

    const ended = await client.callTool({
      name: "session_end",
      arguments: { session_id: sessionId, summary: "Reviewed tubules." },
    });
    expect(ended.isError).not.toBe(true);

    const endedData = JSON.parse(text(ended)) as { notePath: string };
    const notePath = endedData.notePath;
    const note = await app.app.request("/api/note", {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
    // Can't easily GET note via app without knowing path; instead read from vault directly
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(join(root, notePath), "utf8");
    expect(content).toContain("Agent final word.");
    expect(content).toContain("## Agent messages");

    await server.close();
  });

  test("the MCP tools list includes say", async () => {
    const { client, server } = await connect();

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toContain("say");

    await server.close();
  });
});
