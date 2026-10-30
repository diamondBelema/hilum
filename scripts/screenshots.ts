import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";

const port = 45200 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const outDir = join(process.cwd(), "tests/e2e-screenshots");

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not become healthy on ${base}`);
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "harness-screenshots-"));

  // Seed vault.
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
  await mkdir(join(root, "courses/ana-211/concepts"), { recursive: true });
  await writeFile(join(root, "courses/ana-211/INDEX.md"), "# Ana-211\n", "utf8");
  await writeFile(join(root, "courses/ana-211/notes/tubules.md"), "---\ntitle: Tubules\n---\n\n# Tubules {#tubules}\n\nFiltered sodium.\n", "utf8");
  await writeFile(join(root, "courses/ana-211/notes/heart.md"), "---\ntitle: Heart\n---\n\n# Heart {#heart}\n\nThe heart pumps blood.\n", "utf8");
  await writeFile(join(root, "courses/ana-211/concepts/diaphragm.md"), "---\nstatus: proposed\ntitle: Diaphragm\n---\n\n# Diaphragm\n\nPrimary muscle.\n", "utf8");

  const dbPath = join(root, "app.db");
  execFileSync("bun", ["run", "build:ui"], { stdio: "inherit" });

  const server = spawn(process.execPath, ["run", "src/server/index.ts"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HARNESS_DB: dbPath, HARNESS_VAULT: root, HARNESS_SKIP_BUILD: "1" },
  });

  let exitCode = 1;
  let browser: Browser | null = null;
  try {
    await waitForHealth();
    browser = await chromium.launch({ headless: true });
    await mkdir(outDir, { recursive: true });

    async function startSession(page: Page, goal = "screenshot goal") {
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      try {
        await page.getByRole("button", { name: /Change course/ }).waitFor({ timeout: 2000 });
      } catch {
        const picker = page.locator('button[aria-haspopup="listbox"]').first();
        if (await picker.isVisible()) {
          await picker.click();
          const option = page.getByRole("option", { name: /ana-211/i }).first();
          if (await option.isVisible()) await option.click();
        }
      }
      await page.locator('textarea[placeholder="What do you want to learn?"]').fill(goal);
      await page.getByRole("button", { name: "Send" }).click();
      // Wait for navigation.
      for (let i = 0; i < 10; i++) {
        if (page.url().match(/\/sessions\//)) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      await page.waitForTimeout(500);
    }

    const viewports: Array<{ name: string; width: number; height: number }> = [
      { name: "1280x800", width: 1280, height: 800 },
      { name: "390x844", width: 390, height: 844 },
    ];
    const themes: Array<{ name: string; value: string }> = [
      { name: "light", value: "light" },
      { name: "dark", value: "dark" },
    ];

    for (const vp of viewports) {
      for (const theme of themes) {
        const page = await browser!.newPage();
        await page.setViewportSize({ width: vp.width, height: vp.height });

        // Navigate to home first, then set theme via localStorage.
        await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
        await page.evaluate((t) => { localStorage.setItem("eh-theme", t); }, theme.value);
        await page.waitForTimeout(500);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);

        // Home screenshot.
        await page.screenshot({ path: join(outDir, `home-${vp.name}-${theme.name}.png`), fullPage: true });

        // Start a session.
        await startSession(page, "Screenshot test goal");
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(outDir, `live-session-${vp.name}-${theme.name}.png`), fullPage: true });

        // End the session.
        await page.getByLabel("End session").click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ state: "visible", timeout: 3000 });
        await dialog.getByRole("button", { name: "End session" }).click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(outDir, `ended-session-${vp.name}-${theme.name}.png`), fullPage: true });

        await page.context().close();
      }
    }

    // Errored session: navigate to a non-existent session.
    const errPage = await browser!.newPage();
    await errPage.setViewportSize({ width: 1280, height: 800 });
    await errPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await errPage.evaluate(() => { localStorage.setItem("eh-theme", "light"); });
    await errPage.reload({ waitUntil: "domcontentloaded" });
    await errPage.waitForTimeout(500);
    await errPage.goto(`${base}/sessions/does-not-exist`, { waitUntil: "domcontentloaded" });
    await errPage.waitForTimeout(1000);
    await errPage.screenshot({ path: join(outDir, `errored-session-1280x800-light.png`), fullPage: true });
    await errPage.context().close();

    exitCode = 0;
    console.log("Screenshots saved to", outDir);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
