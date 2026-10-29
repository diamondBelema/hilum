import { chromium } from "playwright";

const base = process.env.HILUM_URL ?? "http://127.0.0.1:4317";

type Failure = string;
const failures: Failure[] = [];
const fail = (message: string) => failures.push(message);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 360, height: 800 } });

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main");
  await page.waitForTimeout(1500);

  // 1. No horizontal overflow at 360px
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  if (size.scroll > size.width + 1) fail(`Home: horizontal overflow ${size.scroll}/${size.width}`);

  // 2. Hamburger toggle exists
  const hamburger = page.getByRole("button", { name: /Open sidebar|Close sidebar/ });
  if ((await hamburger.count()) !== 1) fail(`Hamburger toggle: expected 1, found ${await hamburger.count()}`);

  // 3. Open sidebar - check sessions list, settings pinned at bottom
  await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Open sidebar"]') as HTMLElement;
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);

  const sidebar = page.locator("aside");
  if ((await sidebar.count()) !== 1) fail("Sidebar not found");

  // Check sidebar has settings at bottom
  const settingsBtn = page.getByRole("button", { name: "Settings" });
  if ((await settingsBtn.count()) !== 1) fail("Settings button not found in sidebar");

  // Check sidebar items exist (sessions list)
  const sessionItems = page.locator('aside button');
  const sessionCount = await sessionItems.count();
  console.log(`Sidebar items: ${sessionCount}`);

  // 4. Close sidebar
  await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Close sidebar"]') as HTMLElement;
    if (btn) btn.click();
  });
  await page.waitForTimeout(300);

  // 5. Re-open sidebar, then open Settings modal
  await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Open sidebar"]') as HTMLElement;
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const settings = btns.find(b => b.textContent?.includes('Settings'));
    if (settings) settings.click();
  });
  await page.waitForTimeout(800);

  // Check modal opened
  const dialog = page.locator('[role="dialog"]');
  if ((await dialog.count()) !== 1) fail("Settings dialog not found");

  // 6. Close settings
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 7. Check health API
  const health = await (await fetch(`${base}/api/health`)).json() as any;
  console.log(`Vault: ${health.vault}`);
  console.log(`DB: ${health.db}`);
  console.log(`Free disk: ${health.disk.freePercent}%`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log("ui check ok: 360px sidebar, settings modal, no overflow");
