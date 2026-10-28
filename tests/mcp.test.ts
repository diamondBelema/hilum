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
  return { client, server, vault, runner, sessions };
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
      "get_pending_grading",
      "submit_grade",
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

  test("grades theory through MCP tools and prompts", async () => {
    const { client, server, runner } = await connect();
    const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
    expect(prompts).toContain("grade_theory_answer");
    expect(prompts).toContain("exam_debrief");

    const question = {
      id: "ana-211-th-mcp",
      type: "theory",
      question_kind: "mechanism",
      topics: ["renal"],
      concept_ids: ["sodium-reabsorption"],
      marks: 10,
      prompt: "Explain sodium reabsorption.",
      model_answer: "Filtered sodium is reabsorbed.",
      rubric: "Mechanism 10",
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
    await client.callTool({ name: "verify_question", arguments: { id: question.id } });
    const paper = await client.callTool({
      name: "create_paper",
      arguments: {
        course: "ana-211",
        mode: "strict",
        blueprint: [{ section: "C", type: "theory", count: 1, minutes: 20 }],
      },
    });
    const paperId = (JSON.parse(text(paper)) as { id: string }).id;
    const session = runner.start(paperId);
    runner.save(session.attempt.id, { questionId: question.id, response: { text: "Sodium moves." } });
    runner.submit(session.attempt.id);

    const pending = await client.callTool({
      name: "get_pending_grading",
      arguments: { course: "ana-211" },
    });
    const items = JSON.parse(text(pending)) as { answerId: number }[];
    expect(items).toHaveLength(1);
    const answerId = items[0]!.answerId;

    const prompt = await client.getPrompt({
      name: "grade_theory_answer",
      arguments: { answer_id: String(answerId) },
    });
    expect(prompt.messages[0]?.content.type).toBe("text");
    expect((prompt.messages[0]?.content as { text: string }).text).toContain("rubric_scores");

    const graded = await client.callTool({
      name: "submit_grade",
      arguments: {
        answer_id: answerId,
        rubric_scores: [{ heading: "Mechanism", awarded: 7, max: 10 }],
        feedback: "Name the transporter.",
        mistake_tags: ["knowledge_gap"],
      },
    });
    expect(graded.isError).not.toBe(true);
    expect(text(graded)).toContain('"total":7');

    const results = await client.callTool({
      name: "get_attempt_results",
      arguments: { attempt_id: session.attempt.id },
    });
    expect(text(results)).toContain('"status":"graded"');
    const debrief = await client.getPrompt({
      name: "exam_debrief",
      arguments: { attempt_id: session.attempt.id },
    });
    expect((debrief.messages[0]?.content as { text: string }).text).toContain("Debrief");
    await server.close();
  });

  test("runs a live session through MCP tools", async () => {
    const { client, server, sessions } = await connect();
    const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
    expect(prompts).toContain("run_session");
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    for (const name of [
      "session_start",
      "get_session",
      "push_activity",
      "await_response",
      "record_evidence",
      "get_agent_requests",
      "bank_activity",
      "session_end",
    ]) {
      expect(tools).toContain(name);
    }

    const started = await client.callTool({ name: "session_start", arguments: { course: "ana-211" } });
    const session = JSON.parse(text(started)) as { session: { id: string } };
    const sessionId = session.session.id;

    const invalid = await client.callTool({
      name: "push_activity",
      arguments: {
        session_id: sessionId,
        spec: {
          cites: [{ note: "ana-211/notes/tubules.md", anchor: "tubules", quote: "Filtered sodium" }],
          components: [{ type: "not_a_component" }],
        },
      },
    });
    expect(invalid.isError).toBe(true);
    expect(text(invalid)).toContain("Available types");
    expect(text(invalid)).toContain("mcq_single");

    const pushed = await client.callTool({
      name: "push_activity",
      arguments: {
        session_id: sessionId,
        spec: {
          title: "Tubules probe",
          cites: [
            {
              note: "ana-211/notes/tubules.md",
              anchor: "tubules",
              quote: "Filtered sodium is reabsorbed",
            },
          ],
          concept_ids: ["sodium-reabsorption"],
          components: [
            {
              type: "mcq_single",
              stem: "What happens to filtered sodium?",
              options: ["It is secreted", "It is reabsorbed"],
              answer: 1,
              concept_ids: ["sodium-reabsorption"],
            },
            { type: "confidence_rating" },
          ],
        },
      },
    });
    expect(pushed.isError).not.toBe(true);
    const activity = JSON.parse(text(pushed)) as { id: string };

    const answered = sessions.respond(sessionId, activity.id, {
      components: [1, "likely"],
      confidence: "likely",
    }, 12);
    expect(answered.status).toBe("answered");

    const awaited = await client.callTool({
      name: "await_response",
      arguments: { session_id: sessionId, timeout_seconds: 1 },
    });
    expect(text(awaited)).toContain('"status":"answered"');
    expect(text(awaited)).toContain("sodium-reabsorption");

    const request = sessions.request(sessionId, "Explain the transporter");
    expect(request.status).toBe("open");
    const requests = await client.callTool({
      name: "get_agent_requests",
      arguments: { session_id: sessionId },
    });
    expect(text(requests)).toContain("Explain the transporter");

    const banked = await client.callTool({
      name: "bank_activity",
      arguments: { activity_id: activity.id, tags: ["renal"] },
    });
    expect(banked.isError).not.toBe(true);
    expect(text(banked)).toContain("courses/ana-211/activities/");

    const ended = await client.callTool({
      name: "session_end",
      arguments: { session_id: sessionId, summary: "Sodium is reabsorbed." },
    });
    expect(ended.isError).not.toBe(true);
    expect(text(ended)).toContain("courses/ana-211/sessions/");
    await server.close();
  });

  test("exposes the concept graph and mastery frontier", async () => {
    const { client, server } = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    for (const name of [
      "find_concepts",
      "add_concept",
      "link_concepts",
      "update_concept",
      "get_concept",
      "get_graph",
      "get_next_concepts",
      "get_mastery",
      "get_weak_topics",
      "record_real_result",
    ]) {
      expect(names).toContain(name);
    }
    const cite = {
      note: "ana-211/notes/tubules.md",
      anchor: "tubules",
      quote: "Filtered sodium is reabsorbed",
    };
    const parent = await client.callTool({
      name: "add_concept",
      arguments: {
        course: "ana-211",
        id: "ana-211-tubules",
        title: "Tubules",
        exam_weight: 0.2,
        cites: [cite],
        definition: "The tubular system of the nephron.",
      },
    });
    expect(parent.isError).not.toBe(true);
    const child = await client.callTool({
      name: "add_concept",
      arguments: {
        course: "ana-211",
        id: "ana-211-sodium",
        title: "Sodium reabsorption",
        aliases: ["Na reabsorption"],
        parent: "ana-211-tubules",
        prerequisites: ["ana-211-tubules"],
        cites: [cite],
      },
    });
    expect(child.isError).not.toBe(true);

    const found = await client.callTool({
      name: "find_concepts",
      arguments: { query: "Na reabsorption", course: "ana-211" },
    });
    expect(text(found)).toContain("ana-211-sodium");

    const linked = await client.callTool({
      name: "link_concepts",
      arguments: { from_id: "ana-211-sodium", to_id: "ana-211-tubules", type: "related" },
    });
    expect(linked.isError).not.toBe(true);
    expect(text(linked)).toContain('"related":[{"id":"ana-211-tubules"');

    const graph = await client.callTool({
      name: "get_graph",
      arguments: { course: "ana-211" },
    });
    expect(text(graph)).toContain('"type":"related"');

    const fetched = await client.callTool({
      name: "get_concept",
      arguments: { id: "ana-211-sodium" },
    });
    expect(text(fetched)).toContain("Sodium reabsorption");

    const frontier = await client.callTool({
      name: "get_next_concepts",
      arguments: { course: "ana-211", n: 3 },
    });
    expect(text(frontier)).toContain("ana-211-tubules");
    expect(text(frontier)).toContain("Start here");

    const mastery = await client.callTool({
      name: "get_mastery",
      arguments: { course: "ana-211" },
    });
    expect(text(mastery)).toContain('"total":2');
    expect(text(mastery)).toContain('"unseen":2');

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211", goal: "review" },
    });
    expect(started.isError).not.toBe(true);
    expect(text(started)).toContain("mastery_snapshot");
    expect(text(started)).toContain("frontier");
    await server.close();
  });

  test("returns the course answer style when a session starts", async () => {
    await writeFile(
      join(root, "courses/ana-211/answer-style.md"),
      "---\ncourse: ana-211\nstatus: draft\nkinds:\n  - {kind: mechanism, typical_marks: 10}\n---\n\n# Answer style\n\nUse a numbered mechanism and name the nephron segment.\n",
      "utf8",
    );
    await writeFile(
      join(root, "courses/ana-211/course.md"),
      "---\ncode: ana-211\ntitle: Anatomy 211\nanswer_style: courses/ana-211/answer-style.md\n---\n\n# Anatomy 211\n",
      "utf8",
    );
    const { client, server } = await connect();

    const started = await client.callTool({
      name: "session_start",
      arguments: { course: "ana-211" },
    });
    expect(started.isError).not.toBe(true);
    expect(text(started)).toContain("numbered mechanism");
    expect(text(started)).toContain('"status":"draft"');
    expect(text(started)).toContain('"kind":"mechanism"');

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
