import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-jobs-"));
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
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

async function findItem(app: ReturnType<typeof createApp>["app"], id: string) {
  const res = await app.request("/api/inbox");
  const items = (await res.json()) as { id: string; status: string; note_paths: string[]; error: string | null }[];
  return items.find((item) => item.id === id);
}

async function uploadFile(app: ReturnType<typeof createApp>["app"], path: string, filename: string, mime: string) {
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(path);
  const formData = new FormData();
  formData.set("file", new File([bytes], filename, { type: mime }));
  return app.request("/api/inbox/upload", { method: "POST", body: formData });
}

describe("job runner", () => {
  test("converts a PPTX upload into vault notes and marks the inbox item converted", async () => {
    const pptxPath = join(root, "lecture.pptx");
    await makePptx(pptxPath);

    const { app } = createApp({ config: { dbPath: join(root, "state", "app.db"), vaultPath: root } });

    const res = await uploadFile(app, pptxPath, "lecture.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(res.status).toBe(201);
    const result = await res.json() as { item: { id: string; sha256: string } };

    // Assign a course so the sort service marks it "sorted" and enqueues a convert job
    const correctRes = await app.request(`/api/inbox/${result.item.id}/correct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "ana-211" }),
    });
    expect(correctRes.status).toBe(200);

    await waitForMs(3000);

    const item = await findItem(app, result.item.id);
    expect(item).toBeDefined();
    expect(item!.status).toBe("converted");
    expect(item!.note_paths.length).toBeGreaterThan(0);
    expect(item!.error).toBeNull();
  });

  test("dedupe prevents duplicate convert jobs for the same file", async () => {
    const pptxPath = join(root, "dedupe.pptx");
    await makePptx(pptxPath);

    const { app } = createApp({ config: { dbPath: join(root, "state", "app.db"), vaultPath: root } });

    const first = await uploadFile(app, pptxPath, "dedupe.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(first.status).toBe(201);
    const firstResult = await first.json() as { item: { id: string; sha256: string } };
    await app.request(`/api/inbox/${firstResult.item.id}/correct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "ana-211" }),
    });

    const second = await uploadFile(app, pptxPath, "dedupe.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(second.status).toBe(200);
    const secondResult = await second.json() as { item: { id: string; sha256: string } };
    expect(secondResult.item.id).toBe(firstResult.item.id);

    await waitForMs(3000);

    const jobsRes = await app.request("/api/jobs?limit=50");
    const jobs = (await jobsRes.json()) as { type: string; dedupe_key: string | null }[];
    const convertJobs = jobs.filter((j) => j.type === "convert" && j.dedupe_key?.includes("convert:"));
    expect(convertJobs.length).toBeLessThanOrEqual(1);
  });

  test("invalid PPTX content marks the inbox item unreadable", { timeout: 15000 }, async () => {
    const badPptxPath = join(root, "bad.pptx");
    await writeFile(badPptxPath, "not a valid pptx zip file", "utf8");

    const { app } = createApp({ config: { dbPath: join(root, "state", "app.db"), vaultPath: root } });

    const fs = await import("node:fs/promises");
    const bytes = await fs.readFile(badPptxPath);
    const formData = new FormData();
    formData.set("file", new File([bytes], "bad.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
    const res = await app.request("/api/inbox/upload", {
      method: "POST",
      body: formData,
    });
    expect(res.status).toBe(201);
    const result = await res.json() as { item: { id: string } };
    await app.request(`/api/inbox/${result.item.id}/correct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "ana-211" }),
    });

    await waitForMs(3000);

    const item = await findItem(app, result.item.id);
    expect(item).toBeDefined();
    expect(item!.status).toBe("unreadable");
    expect(item!.error).toBeTruthy();
  });
});
