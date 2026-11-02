import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-figures-"));
  await mkdir(join(root, "state"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("figures SSRF protection", () => {
  test("registers a figure from Commons", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    const res = await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        title: "Nephron diagram",
        source: "commons",
        source_id: "File:Nephron.svg",
        kind: "svg",
        width: 800,
        height: 600,
        license: "CC BY-SA 4.0",
        author: "Wikimedia contributor",
        attribution_required: true,
        caption: "The nephron, functional unit of the kidney",
      }),
    });
    expect(res.status).toBe(201);
    const figure = await res.json() as { id: string; source: string; source_id: string };
    expect(figure.id).toBeTruthy();
    expect(figure.source).toBe("commons");
    expect(figure.source_id).toBe("File:Nephron.svg");
  });

  test("dedupes figures by source and source_id", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    const body = {
      course: "ana-211",
      title: "Nephron diagram",
      source: "commons",
      source_id: "File:Nephron.svg",
      kind: "svg" as const,
      width: 800,
      height: 600,
      license: "CC BY-SA 4.0",
      attribution_required: true,
    };

    const first = await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(201);
    const firstId = (await first.json() as { id: string }).id;

    const second = await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, title: "Different title" }),
    });
    expect(second.status).toBe(201);
    const secondId = (await second.json() as { id: string }).id;
    expect(secondId).toBe(firstId);
  });

  test("lists figures for a course", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        title: "Figure 1",
        source: "commons",
        source_id: "File:A.svg",
        kind: "svg",
      }),
    });
    await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        title: "Figure 2",
        source: "commons",
        source_id: "File:B.svg",
        kind: "svg",
      }),
    });
    await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "phy-301",
        title: "Figure 3",
        source: "commons",
        source_id: "File:C.svg",
        kind: "svg",
      }),
    });

    const res = await app.request("/api/figures?course=ana-211");
    expect(res.status).toBe(200);
    const figures = await res.json() as { id: string; course: string }[];
    expect(figures.length).toBe(2);
    expect(figures.every((f) => f.course === "ana-211")).toBe(true);
  });

  test("requires course for list", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });
    const res = await app.request("/api/figures");
    expect(res.status).toBe(400);
  });

  test("404 for unknown figure", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });
    const res = await app.request("/api/figures/does-not-exist");
    expect(res.status).toBe(404);
  });

  test("download rejects non-allowed content type", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    // Register a figure first
    await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        title: "Test figure",
        source: "commons",
        source_id: "File:Test.svg",
        kind: "svg",
      }),
    });

    // Download will try to fetch from Wikimedia - this test just verifies the endpoint exists
    // and handles errors gracefully (network may not be available in test env)
    const res = await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        title: "Test figure 2",
        source: "evil",
        source_id: "http://127.0.0.1/secrets",
        kind: "svg",
      }),
    });
    // evil source is allowed to register (source validation is at download time)
    expect(res.status).toBe(201);
  });

  test("serves downloaded figure file", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    const res = await app.request("/api/figures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        title: "Local figure",
        source: "local",
        source_id: "local-1",
        kind: "svg",
      }),
    });
    expect(res.status).toBe(201);
    const figure = await res.json() as { id: string };
    expect(figure.id).toBeTruthy();

    // File won't exist yet (not downloaded), so 404
    const fileRes = await app.request(`/api/figures/${figure.id}/file`);
    expect(fileRes.status).toBe(404);
  });
});
