import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.HARNESS_BASE ?? `http://127.0.0.1:${process.env.PORT ?? 4747}`;
const VAULT = process.env.HARNESS_VAULT ?? join(homedir(), "Documents", "hilum-vault");

interface PaperFrontmatter {
  course: string;
  title: string;
  topics?: string[];
  source?: string;
  paper?: string;
}

function parseFrontmatter(raw: string): { fm: PaperFrontmatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: { course: "", title: "" }, body: raw };
  const fmText = m[1];
  const body = m[2];
  const fm: PaperFrontmatter = { course: "", title: "" };
  for (const line of fmText.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let val: unknown = kv[2].trim().replace(/^"(.+)"$/, "$1");
    if (key === "topics") {
      const arr = val as string;
      const items: string[] = [];
      const re = /\[([\s\S]*?)\]/g;
      let match;
      while ((match = re.exec(arr)) !== null) {
        for (const item of match[1].split(",")) {
          const t = item.trim().replace(/^"(.+)"$/, "$1");
          if (t) items.push(t);
        }
      }
      val = items;
    }
    (fm as Record<string, unknown>)[key] = val;
  }
  return { fm, body };
}

function extractQuestions(body: string): string[] {
  // Find the numbered question list. Questions start at line beginning with "N." or "N. " or "N) "
  // and continue until the next number or an image line.
  const lines = body.split("\n");
  const questionLines: string[] = [];
  let current: string[] = [];
  let inQuestions = false;
  const numRe = /^\s*(\d+)\s*[.)]\s+(.+)/;

  for (const line of lines) {
    const m = numRe.exec(line);
    if (m) {
      if (inQuestions && current.length) questionLines.push(current.join(" ").trim());
      current = [m[2]];
      inQuestions = true;
    } else if (inQuestions) {
      if (/^\s*!\[/.test(line)) break; // stop at image
      if (/^\s*$/.test(line)) {
        if (current.length) questionLines.push(current.join(" ").trim());
        current = [];
        inQuestions = false;
        continue;
      }
      // continuation line (indented or part of a multi-line question)
      if (/^\s{2,}/.test(line) || line.trim().length > 0) {
        current.push(line.trim());
      }
    }
  }
  if (inQuestions && current.length) questionLines.push(current.join(" ").trim());
  return questionLines.filter((q) => q.length > 10);
}

async function mcpCall(method: string, params: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });
  if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  // Response may be SSE or plain JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`no JSON in MCP response: ${text.slice(0, 200)}`);
  const json = JSON.parse(jsonMatch[0]);
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function main() {
  // Initialize MCP session
  await mcpCall("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "import-script", version: "1.0" },
  });
  // Send initialized notification (no response expected)
  await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  const pastDirs: { dir: string; course: string }[] = [
    { dir: join(VAULT, "courses", "ana-202a", "past-questions"), course: "ana-202a" },
    { dir: join(VAULT, "courses", "ana-207", "past-questions"), course: "ana-207" },
  ];
  let totalImported = 0;

  for (const { dir: pastDir, course } of pastDirs) {
    let files: string[];
    try {
      files = readdirSync(pastDir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of files) {
      const raw = readFileSync(join(pastDir, file), "utf8");
      const { fm, body } = parseFrontmatter(raw);
      const questions = extractQuestions(body);
      if (questions.length === 0) {
        console.log(`SKIP ${file}: no questions extracted`);
        continue;
      }

      const notePath = `courses/${course}/past-questions/${file}`;
      const inputQuestions = questions.map((q, i) => ({
        id: `${fm.course}-pp-${file.replace(/\.md$/, "").replace(/[^a-z0-9]/gi, "-").slice(0, 30)}-${String(i + 1).padStart(2, "0")}`,
        type: "theory",
        question_kind: "essay",
        topics: fm.topics ?? [fm.course],
        concept_ids: [],
        difficulty: "medium" as const,
        marks: 20,
        prompt: q,
        answer_input: "text" as const,
        cites: [
          {
            note: notePath,
            quote: q.slice(0, 120),
          },
        ],
        source_paper: notePath,
        verified: false,
        unverified: true,
      }));

      const result = await mcpCall("tools/call", {
        name: "import_past_paper",
        arguments: {
          course: fm.course,
          source: notePath,
          title: fm.title,
          questions: inputQuestions,
          request_id: `import-${file.replace(/[^a-z0-9]/gi, "-")}`,
        },
      });

      const content = (result as { content?: { text: string }[] })?.content?.[0]?.text;
      const parsed = content ? JSON.parse(content) : result;
      const r = parsed as { imported: number };
      console.log(`IMPORTED ${file}: ${r.imported} questions`);
      totalImported += r.imported;
    }
  }

  console.log(`\nTotal imported: ${totalImported} questions`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});