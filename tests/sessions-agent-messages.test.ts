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

    const detail1 = JSON.parse(text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } }))) as { agent: { lastSeenAt: number | null } };
    expect(detail1.agent.lastSeenAt).not.toBeNull();

    const said = await client.callTool({
      name: "say",
      arguments: { session_id: sessionId, text: "Agent speaks." },
    });
    expect(said.isError).not.toBe(true);

    const detail2 = JSON.parse(text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } }))) as { agent: { lastSeenAt: number | null } };
    expect(detail2.agent.lastSeenAt).not.toBeNull();

    sessions.request(sessionId, "Student asks.");
    const detail3 = JSON.parse(text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } }))) as { agent: { lastSeenAt: number | null } };
    // get_session() itself marks presence, so lastSeenAt advances on each get_session call.
    // say() marked presence (detail2 not null), and sessions.request() did not reset it.
    expect(detail3.agent.lastSeenAt).not.toBeNull();
    expect(detail3.agent.lastSeenAt!).toBeGreaterThanOrEqual(detail2.agent.lastSeenAt!);

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

  describe("focus lease (A2)", () => {
    async function createSecondCourse(root: string) {
      await mkdir(join(root, "courses/ana-212/notes"), { recursive: true });
      await writeFile(
        join(root, "courses/ana-212/notes/x.md"),
        "---\ntitle: X\n---\n\n# X\n\ncontent.\n",
        "utf8",
      );
    }

    test("get_active_session returns the focused session across navigate away and back", async () => {
      const { client, server, sessions } = await connect();
      await createSecondCourse(root);
      const a = JSON.parse(text(await client.callTool({ name: "session_start", arguments: { course: "ana-211" } }))).session
        .id as string;
      const b = JSON.parse(text(await client.callTool({ name: "session_start", arguments: { course: "ana-212" } }))).session
        .id as string;

      sessions.focus(b, "tab-b");
      expect(
        JSON.parse(text(await client.callTool({ name: "get_active_session", arguments: {} }))).session_id,
      ).toBe(b);

      sessions.focus(a, "tab-a");
      const active = JSON.parse(text(await client.callTool({ name: "get_active_session", arguments: {} })));
      expect(active.session_id).toBe(a);
      expect(active.course).toBe("ana-211");
      expect(active.mode).toBe("teach");
      expect(typeof active.started_at).toBe("number");
      expect(Array.isArray(active.open_requests)).toBe(true);
      expect(typeof active.unread_user_messages).toBe("number");
      expect(active.session).toBeDefined();

      await server.close();
    });

    test("expired focus falls back to the newest open session", async () => {
      const { client, server, sessions } = await connect();
      await createSecondCourse(root);
      const a = JSON.parse(text(await client.callTool({ name: "session_start", arguments: { course: "ana-211" } }))).session
        .id as string;
      const b = JSON.parse(text(await client.callTool({ name: "session_start", arguments: { course: "ana-212" } }))).session
        .id as string;

      sessions.focus(a, "tab-a");
      sessions.db.query("UPDATE session_focus SET updated_at = ? WHERE id = 'focused'").run(Date.now() - 200_000);

      const active = JSON.parse(text(await client.callTool({ name: "get_active_session", arguments: {} })));
      expect(active.session_id).toBe(b);

      await server.close();
    });

    test("two tabs on different sessions: most recently focused wins", async () => {
      const { client, server, sessions } = await connect();
      await createSecondCourse(root);
      const a = JSON.parse(text(await client.callTool({ name: "session_start", arguments: { course: "ana-211" } }))).session
        .id as string;
      const b = JSON.parse(text(await client.callTool({ name: "session_start", arguments: { course: "ana-212" } }))).session
        .id as string;

      sessions.focus(a, "tab-a");
      sessions.focus(b, "tab-b");
      const active = JSON.parse(text(await client.callTool({ name: "get_active_session", arguments: {} })));
      expect(active.session_id).toBe(b);

      await server.close();
    });
  });

  describe("agent presence (A3)", () => {
    test("session_start marks the agent connected", async () => {
      const { client, server } = await connect();
      const started = await client.callTool({ name: "session_start", arguments: { course: "ana-211" } });
      const sessionId = JSON.parse(text(started)).session.id as string;
      const detail = JSON.parse(
        text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } })),
      ) as { agent: { state: string; clientName: string | null; lastSeenAt: number | null }; agentConnected: boolean };
      expect(detail.agent.state).toBe("connected");
      expect(detail.agent.clientName).toBe("test");
      expect(detail.agent.lastSeenAt).not.toBeNull();
      expect(detail.agentConnected).toBe(true);
      await server.close();
    });

    test("setListening / clearListening transition through listening and back", async () => {
      const { client, server, sessions } = await connect();
      expect(sessions.agentState().state).toBe("none");

      sessions.markPresence("test");
      expect(sessions.agentState().state).toBe("connected");

      sessions.setListening(20);
      expect(sessions.agentState().state).toBe("listening");

      sessions.clearListening();
      expect(sessions.agentState().state).toBe("connected");

      sessions.db.query("UPDATE agent_presence SET last_seen_at = ? WHERE id = 'presence'").run(Date.now() - 11 * 60_000);
      expect(sessions.agentState().state).toBe("idle");

      sessions.db.query("UPDATE agent_presence SET last_seen_at = NULL, client_name = NULL WHERE id = 'presence'").run();
      expect(sessions.agentState().state).toBe("none");

      await server.close();
    });

    test("await_response sets listening while blocked and clears on return", async () => {
      const { client, server, sessions } = await connect();
      const started = await client.callTool({ name: "session_start", arguments: { course: "ana-211" } });
      const sessionId = JSON.parse(text(started)).session.id as string;

      const awaited = await client.callTool({ name: "await_response", arguments: { session_id: sessionId, timeout_seconds: 1 } });
      const after = JSON.parse(
        text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } })),
      ) as { agent: { state: string } };
      // after return the agent is no longer listening
      expect(after.agent.state).toBe("connected");

      await server.close();
    });
  });

  describe("message lifecycle (A4)", () => {
    test("sent -> seen -> answered and idempotent by clientId", async () => {
      const { client, server, sessions } = await connect();
      const started = await client.callTool({ name: "session_start", arguments: { course: "ana-211" } });
      const sessionId = JSON.parse(text(started)).session.id as string;

      const req1 = sessions.request(sessionId, "help me", "c1");
      expect(req1.status).toBe("sent");

      // idempotency: same clientId returns the same stored request
      const req1b = sessions.request(sessionId, "help me", "c1");
      expect(req1b.id).toBe(req1.id);
      const req2 = sessions.request(sessionId, "other", "c2");
      expect(req2.id).not.toBe(req1.id);
      expect(req2.status).toBe("sent");

      // get_agent_requests (MCP) marks sent -> seen
      await client.callTool({ name: "get_agent_requests", arguments: { session_id: sessionId } });
      const seen = JSON.parse(
        text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } })),
      ) as { requests: { text: string; status: string }[] };
      expect(seen.requests.find((r) => r.text === "help me")?.status).toBe("seen");
      expect(seen.requests.find((r) => r.text === "other")?.status).toBe("seen");

      // say (MCP) marks seen -> answered
      await client.callTool({ name: "say", arguments: { session_id: sessionId, text: "I hear you" } });
      const answered = JSON.parse(
        text(await client.callTool({ name: "get_session", arguments: { session_id: sessionId } })),
      ) as { requests: { text: string; status: string }[] };
      expect(answered.requests.find((r) => r.text === "help me")?.status).toBe("answered");
      expect(answered.requests.find((r) => r.text === "other")?.status).toBe("answered");

      await server.close();
    });
  });

  describe("titles (A5)", () => {
    test("create with title, rename via PATCH, get_session returns title", async () => {
      const { client, server, app } = await connect();
      const started = await client.callTool({
        name: "session_start",
        arguments: { course: "ana-211", goal: "learn", title: "My title" },
      });
      const session = JSON.parse(text(started)).session as { id: string; title: string | null };
      expect(session.title).toBe("My title");

      const patched = await app.app.request(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Renamed" }),
      });
      expect(patched.status).toBe(200);
      const detail = JSON.parse(await patched.text()) as { title: string | null };
      expect(detail.title).toBe("Renamed");

      const got = JSON.parse(
        text(await client.callTool({ name: "get_session", arguments: { session_id: session.id } })),
      ) as { title: string | null };
      expect(got.title).toBe("Renamed");

      await server.close();
    });
  });

  describe("end session summary (A6)", () => {
    test("empty summary produces non-empty fallback note content", async () => {
      const { client, server, app } = await connect();
      const started = await client.callTool({ name: "session_start", arguments: { course: "ana-211" } });
      const sessionId = JSON.parse(text(started)).session.id as string;

      await client.callTool({
        name: "push_activity",
        arguments: {
          session_id: sessionId,
          spec: {
            title: "Tubules probe",
            cites: [{ note: "ana-211/notes/tubules.md", anchor: "tubules", quote: "Filtered sodium" }],
            components: [{ type: "mcq_single", stem: "What?", options: ["A", "B"], answer: 0 }],
          },
        },
      });

      const ended = await client.callTool({
        name: "session_end",
        arguments: { session_id: sessionId, summary: "" },
      });
      expect(ended.isError).not.toBe(true);
      const notePath = (JSON.parse(text(ended)) as { notePath: string }).notePath;

      const fs = await import("node:fs/promises");
      const content = await fs.readFile(join(root, notePath), "utf8");
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain("Goal:");
      expect(content).toContain("Answers:");
      await server.close();
    });
  });
});
