import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToString } from "react-dom/server.node";
import { openDb, type Db } from "../src/server/db.ts";
import { VaultService } from "../src/server/vault/service.ts";
import { EventBus } from "../src/server/events.ts";
import { SessionService } from "../src/server/sessions/service.ts";
import {
  ACTIVITY_TYPES,
  parseActivitySpec,
  validateActivityResponse,
  type ActivitySpec,
} from "../src/server/sessions/activities.ts";
import { ActivityRenderer } from "../src/ui/components/ActivityRenderer.tsx";

const CITE = {
  note: "ana-211/notes/tubules.md",
  anchor: "tubules",
  quote: "Filtered sodium is reabsorbed",
};

const COMPONENTS = {
  flashcard: { type: "flashcard", front: "Where is sodium reabsorbed?", back: "Proximal tubule" },
  cloze: { type: "cloze", text: "Filtered {{sodium}} is reabsorbed." },
  mcq_single: { type: "mcq_single", stem: "What happens to sodium?", options: ["Secreted", "Reabsorbed"], answer: 1 },
  mcq_multi: { type: "mcq_multi", stem: "Select all ions.", options: ["Sodium", "Potassium", "Calcium"], answer: [0, 1] },
  tf_multi: { type: "tf_multi", stem: "Mark each statement.", statements: [{ text: "Sodium is reabsorbed.", answer: true }, { text: "Sodium is secreted.", answer: false }] },
  short_answer: { type: "short_answer", stem: "Where is sodium reabsorbed?" },
  matching: { type: "matching", pairs: [{ left: "Sodium", right: "Na+" }, { left: "Potassium", right: "K+" }] },
  ordering: { type: "ordering", items: [{ id: "a", text: "First" }, { id: "b", text: "Second" }] },
  theory: { type: "theory", prompt: "Explain sodium handling.", marks: 5 },
  calculation: { type: "calculation", stem: "Calculate the dose.", answer: 5, tolerance: 0.5 },
  worked_example_stepper: { type: "worked_example_stepper", title: "Follow the sodium", steps: [{ title: "Filter", body: "Sodium enters the filtrate." }] },
  predict_reveal: { type: "predict_reveal", prompt: "Predict the effect.", reveal: "More sodium is lost." },
  compare_table: { type: "compare_table", columns: ["Segment", "Action"], rows: [["Proximal", "Reabsorb"]] },
  mermaid_diagram: { type: "mermaid_diagram", code: "flowchart LR\nA-->B" },
  concept_map: { type: "concept_map", nodes: [{ id: "a", label: "Sodium" }], edges: [{ from: "a", to: "b" }] },
  label_diagram: { type: "label_diagram", labels: ["A", "B"] },
  timeline: { type: "timeline", events: ["Step 1", "Step 2"] },
  annotated_image: { type: "annotated_image" },
  spotter_station: { type: "spotter_station", question: "Identify the structure." },
  confidence_rating: { type: "confidence_rating" },
  think_aloud: { type: "think_aloud", prompt: "Walk me through it.", min_words: 1 },
  muddy_point: { type: "muddy_point", prompt: "What is confusing?" },
  spot_the_error: { type: "spot_the_error", text: "Line one.\nLine two has an error." },
  teach_back: { type: "teach_back", prompt: "Teach it back." },
  case_vignette: { type: "case_vignette", stem: "A patient presents...", questions: ["What is the diagnosis?", "What is the treatment?"] },
} as const;

let root: string;
let db: Db;
let vault: VaultService;
let sessions: SessionService;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-sessions-"));
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
  await writeFile(
    join(root, "courses/ana-211/notes/tubules.md"),
    "---\ntitle: Tubules\n---\n\n# Tubules\n\nFiltered sodium is reabsorbed in the proximal tubule.\n",
    "utf8",
  );
  db = openDb(":memory:");
  vault = new VaultService(db, root);
  sessions = new SessionService(db, vault, new EventBus());
});

afterEach(async () => {
  db.close();
  await rm(root, { recursive: true, force: true });
});

describe("ActivitySpec", () => {
  test("accepts every shipped component type", () => {
    expect(ACTIVITY_TYPES).toHaveLength(25);
    for (const type of ACTIVITY_TYPES) {
      const spec = parseActivitySpec({ cites: [CITE], components: [COMPONENTS[type]] });
      expect(spec.components[0]?.type).toBe(type);
    }
  });

  test("rejects unknown components with the available list", () => {
    expect(() =>
      parseActivitySpec({ cites: [CITE], components: [{ type: "model3d" }] }),
    ).toThrow(/unknown activity component "model3d".*Available types: flashcard, cloze/);
  });

  test("validates answers and marks objective responses", () => {
    const spec = parseActivitySpec({
      cites: [CITE],
      components: [COMPONENTS.mcq_single, COMPONENTS.tf_multi, COMPONENTS.cloze, COMPONENTS.confidence_rating],
    });
    expect(() =>
      validateActivityResponse(spec, { components: [null, [true, false], ["sodium"], "sure"], confidence: "sure" }),
    ).toThrow(/choose an option/);
    expect(() =>
      validateActivityResponse(spec, { components: [1, [true, null], ["sodium"], "sure"], confidence: "sure" }),
    ).toThrow(/mark every statement/);
    expect(() =>
      validateActivityResponse(spec, { components: [1, [true, false], [""], "sure"], confidence: "sure" }),
    ).toThrow(/fill every blank/);
    const response = validateActivityResponse(spec, {
      components: [1, [true, false], ["sodium"], "sure"],
      confidence: "sure",
    });
    expect(response.components).toEqual([1, [true, false], ["sodium"], "sure"]);
    expect(response.confidence).toBe("sure");
  });

  test("renders each catalog component", () => {
    for (const type of ACTIVITY_TYPES) {
      const spec = { cites: [CITE], concept_ids: [], components: [COMPONENTS[type]] } as unknown as ActivitySpec;
      const html = renderToString(
        <ActivityRenderer
          activityId="act-test"
          spec={spec}
          values={[]}
          onChange={() => {}}
          onOpenNote={() => {}}
          onRenderError={() => {}}
        />,
      );
      expect(html.length).toBeGreaterThan(20);
      expect(html).toContain("tubules.md");
    }
  });
});

describe("SessionService", () => {
  test("pushes, answers, banks and ends a cited session", async () => {
    const session = await sessions.start("ana-211", "review");
    const activity = await sessions.pushActivity(session.id, {
      title: "Sodium probe",
      cites: [CITE],
      concept_ids: ["sodium-reabsorption"],
      components: [
        { ...COMPONENTS.mcq_single, concept_ids: ["sodium-reabsorption"] },
        { type: "confidence_rating", concept_ids: ["sodium-reabsorption"] },
        { ...COMPONENTS.think_aloud, prompt: "Explain your choice.", min_words: 2 },
      ],
    });
    expect(activity.cites[0]?.anchor).toBe("tubules");

    const answered = sessions.respond(
      session.id,
      activity.id,
      {
        components: [1, "likely", "sodium is reclaimed"],
        confidence: "likely",
        think_aloud: "sodium is reclaimed",
      },
      9,
    );
    expect(answered.status).toBe("answered");
    const detail = sessions.detail(session.id);
    expect(detail.evidenceCount).toBe(3);
    const evidence = db
      .query("SELECT concept_id, correct FROM evidence WHERE activity_id = ? ORDER BY id")
      .all(activity.id) as { concept_id: string; correct: number | null }[];
    expect(evidence.every((row) => row.concept_id === "sodium-reabsorption")).toBe(true);
    expect(evidence[0]?.correct).toBe(1);
    expect(evidence[1]?.correct).toBeNull();

    const awaited = await sessions.awaitResponse(session.id, 0);
    expect(awaited.status).toBe("answered");
    expect(awaited.activity?.response?.confidence).toBe("likely");

    const banked = await sessions.bankActivity(activity.id, ["renal"]);
    expect(banked.path).toStartWith("courses/ana-211/activities/");
    const bankedContent = await readFile(join(root, banked.path), "utf8");
    expect(bankedContent).toContain("Filtered sodium is reabsorbed");
    expect(bankedContent).toContain("Sodium probe");

    const ended = await sessions.end(session.id, "Sodium handling is clearer.");
    expect(ended.endedAt).toBeNumber();
    expect(ended.notePath).toStartWith("courses/ana-211/sessions/");
    const note = await readFile(join(root, ended.notePath ?? ""), "utf8");
    expect(note).toContain("Sodium handling is clearer.");
    expect(note).toContain("Sodium probe (answered)");
    expect(sessions.active("ana-211")).toBeNull();
  });

  test("rejects uncited and unknown activities without writing", async () => {
    const session = await sessions.start("ana-211", "learn");
    await expect(
      sessions.pushActivity(session.id, { cites: [], components: [COMPONENTS.flashcard] }),
    ).rejects.toThrow(/at least 1 element/);
    await expect(
      sessions.pushActivity(session.id, {
        cites: [{ ...CITE, quote: "not in the note" }],
        components: [COMPONENTS.flashcard],
      }),
    ).rejects.toThrow(/quote not found/);
    await expect(
      sessions.pushActivity(session.id, {
        cites: [CITE],
        components: [{ type: "unknown" }],
      }),
    ).rejects.toThrow(/Unknown types|unknown activity component/);
    expect(sessions.detail(session.id).activities).toHaveLength(0);
  });

  test("queues requests, reports render errors and keeps agent presence separate", async () => {
    const session = await sessions.start("ana-211", "learn", "app");
    expect(session.agentConnected).toBe(false);
    const request = sessions.request(session.id, "I am confused");
    expect(request.status).toBe("open");

    const activity = await sessions.pushActivity(session.id, {
      title: "Broken diagram",
      cites: [CITE],
      components: [{ type: "mermaid_diagram", code: "not a diagram" }],
    });
    sessions.renderError(session.id, activity.id, "Parse error");
    const detail = sessions.detail(session.id);
    expect(detail.activity?.status).toBe("error");
    expect(detail.activity?.renderError).toBe("Parse error");

    const waited = await sessions.awaitResponse(session.id, 0);
    expect(waited.status).toBe("timeout");
    expect(waited.requests[0]?.text).toBe("I am confused");
    expect(waited.renderErrors[0]?.message).toBe("Parse error");
    expect(waited.waitingFor).toBeUndefined();
  });
});
