import { chromium } from "playwright";

const port = process.env.PORT ?? "4747";
const base = process.env.HILUM_URL ?? `http://127.0.0.1:${port}`;

type Failure = string;
const failures: Failure[] = [];
const fail = (message: string) => failures.push(message);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, init);
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return (await response.json()) as T;
}

async function ensureSession(): Promise<{ id: string; goal: string }> {
  const history = await api<{ id: string; goal: string }[]>("/api/sessions/history");
  if (history[0]) return history[0];

  const courses = await api<{ code: string }[]>("/api/courses");
  const course = courses[0];
  if (!course) throw new Error("no course in the vault; cannot check the session screen");
  const created = await api<{ id: string; goal: string }>("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ course: course.code, goal: "UI check session" }),
  });
  return created;
}

const session = await ensureSession();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const page = await browser.newPage({ viewport: { width: 360, height: 800 } });

async function checkScreen(name: string, heading: string) {
  await page.waitForTimeout(500);
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  if (size.scroll > size.width + 1) fail(`${name}: horizontal overflow ${size.scroll}/${size.width}`);

  const visibleHeading = await page.getByRole("heading", { name: heading }).first().isVisible().catch(() => false);
  if (!visibleHeading) fail(`${name}: missing visible heading "${heading}"`);

  const main = await page.locator("main#main").count();
  if (main !== 1) fail(`${name}: expected one main landmark`);
}

async function openDrawer() {
  await page.getByRole("button", { name: "Open sessions" }).click();
  await page.waitForTimeout(200);
  const dialog = page.getByRole("dialog", { name: "Sessions" });
  if ((await dialog.count()) !== 1) {
    fail("Drawer: did not open");
  }
  return dialog;
}

try {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main#main");
  await checkScreen("Home", "What do you want to learn?");
  if ((await page.getByRole("button", { name: /Course|Choose a course/i }).count()) < 1) {
    fail("Home: course chip is not a control");
  }

  await openDrawer();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if ((await page.getByRole("dialog", { name: "Sessions" }).count()) !== 0) {
    fail("Drawer: Escape did not close it");
  }

  const sessionDrawer = await openDrawer();
  await sessionDrawer.getByRole("link", { name: new RegExp(session.goal) }).first().click();
  await page.waitForTimeout(800);
  await checkScreen("Session", "Transcript");

  const libraryDrawer = await openDrawer();
  await libraryDrawer.getByRole("link", { name: "Library" }).click();
  await checkScreen("Library", "Library");
  if (!page.url().endsWith("/library")) fail(`Library: unexpected url ${page.url()}`);

  const settingsDrawer = await openDrawer();
  await settingsDrawer.getByRole("link", { name: "Settings" }).click();
  await checkScreen("Settings", "Settings");

  await page.getByRole("radio", { name: "Dark" }).click();
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") {
    fail("Settings: dark theme did not apply");
  }
  await checkScreen("Settings (dark)", "Settings");
  await page.getByRole("radio", { name: "Light" }).click();
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "light") {
    fail("Settings: light theme did not apply");
  }

  const health = await api<{ status: string }>("/api/health");
  if (health.status !== "ok") fail("Health endpoint is not ok");
} finally {
  await browser.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log("ui check ok: home, session, library and settings at 360px");
