import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-loop-"));
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
  await mkdir(join(root, "courses/ana-211/assets"), { recursive: true });
  await writeFile(
    join(root, "courses/ana-211/course.md"),
    "---\ncode: ana-211\ntitle: Anatomy\nexam_date: 2026-12-01\n---\n\n# Anatomy\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function makePptx(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = `
from pptx import Presentation
prs = Presentation()
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "Renal Physiology"
slide.placeholders[1].text = "The nephron filters blood. Glomerulus filters at high pressure. Tubules reabsorb sodium."
prs.save("${path}")
`;
    execFile("python3", ["-c", script], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function waitForMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadFile(
  app: ReturnType<typeof createApp>["app"],
  path: string,
  filename: string,
  mime: string,
) {
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(path);
  const formData = new FormData();
  formData.set("file", new File([bytes], filename, { type: mime }));
  return app.request("/api/inbox/upload", { method: "POST", body: formData });
}

async function findItem(
  app: ReturnType<typeof createApp>["app"],
  id: string,
) {
  const res = await app.request("/api/inbox");
  const items = (await res.json()) as { id: string; status: string; note_paths: string[]; error: string | null }[];
  return items.find((item) => item.id === id);
}

describe("end-to-end loop", () => {
  test(
    "upload sorts, converts, queues map_concepts, fake agent completes, plan created",
    { timeout: 45000 },
    async () => {
      const pptxPath = join(root, "lecture.pptx");
      await makePptx(pptxPath);

      const { app, db, jobs, jobsRunner } = createApp({
        config: { dbPath: join(root, "state", "app.db"), vaultPath: root },
      });

      // 1. Upload a fixture PPTX.
      const res = await uploadFile(app, pptxPath, "lecture.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      expect(res.status).toBe(201);
      const result = await res.json() as { item: { id: string; sha256: string } };

      // Assign a course so sorting enqueues a convert job.
      const correctRes = await app.request(`/api/inbox/${result.item.id}/correct`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "ana-211" }),
      });
      expect(correctRes.status).toBe(200);

      // 2. Wait for conversion (runner is still running).
      await waitForMs(5000);

      const item = await findItem(app, result.item.id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("converted");
      expect(item!.note_paths.length).toBeGreaterThan(0);
      expect(item!.error).toBeNull();

      // 3. map_concepts job should be queued by the runner.
      await waitForMs(1000);
      const jobsRes = await app.request("/api/jobs?limit=50");
      const allJobs = (await jobsRes.json()) as { id: string; type: string; status: string; dedupe_key: string | null }[];
      const mapJobs = allJobs.filter((j) => j.type === "map_concepts");
      expect(mapJobs.length).toBeGreaterThan(0);

      // 4. Stop the runner so the fake agent controls job completion.
      jobsRunner.stop();

      // 5. Fake agent: lease and complete the map_concepts job.
      const mapJob = mapJobs[0];
      const leased = jobs.leaseServer("agent", ["map_concepts"]);
      expect(leased).toBeDefined();
      expect(leased!.id).toBe(mapJob.id);
      jobs.complete(leased!.id, "agent", null);

      // Verify job marked done.
      const afterComplete = await app.request("/api/jobs?limit=50");
      const afterJobs = (await afterComplete.json()) as { id: string; status: string }[];
      expect(afterJobs.find((j) => j.id === mapJob.id)!.status).toBe("done");

      // 6. Create a goal/plan.
      const createGoalRes = await app.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "ana-211", title: "Renal review", study_min_per_day: 30 }),
      });
      expect(createGoalRes.status).toBe(201);
      const goal = await createGoalRes.json() as { id: string };

      const proposeRes = await app.request(`/api/goals/${goal.id}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(proposeRes.status).toBe(201);

      // 7. Status pill states exist via launcher endpoint.
      const statusRes = await app.request("/api/agent/status");
      expect(statusRes.status).toBe(200);
      const status = await statusRes.json() as { state: string };
      expect(["not_configured", "idle", "starting", "working", "stopped", "failed", "none"]).toContain(status.state);
    },
  );
});
