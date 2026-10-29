import { test } from "bun:test";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:4747";

async function runInteractionTest(viewport: { width: number; height: number }, testName: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  let failedStep = "";
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  async function step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      failedStep = `${testName} > ${name}: ${err instanceof Error ? err.message : String(err)}`;
      throw new Error(failedStep);
    }
  }

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  await step("home page loads with composer", async () => {
    const composer = page.locator('button:has-text("Start session")');
    if (!(await composer.isVisible())) throw new Error("Composer not visible");
  });

  await step("start session disabled without course", async () => {
    const sendBtn = page.locator('button:has-text("Start session")');
    if (!(await sendBtn.isDisabled())) throw new Error("Send should be disabled without course");
  });

  await step("select course from picker", async () => {
    const coursePicker = page.locator('button:has-text("Choose a course")');
    await coursePicker.click();
    await page.waitForTimeout(200);
    const firstCourse = page.locator("option").first();
    await firstCourse.click();
    await page.waitForTimeout(200);
  });

  await step("type goal and start session", async () => {
    const textarea = page.locator('input[placeholder*="what do you want to learn"], textarea[placeholder*="what do you want to learn"]');
    await textarea.fill("Test the proximal convoluted tubule");
    const composer = page.locator('button:has-text("Start session")');
    await composer.click();
    await page.waitForLoadState("networkidle");
    const url = page.url();
    if (!/\/sessions\//.test(url)) throw new Error(`Expected session URL, got ${url}`);
  });

  await step("send message in session", async () => {
    const sessionComposer = page.locator('input[placeholder*="Type to ask the agent"], textarea[placeholder*="Type to ask the agent"]');
    if (!(await sessionComposer.isVisible())) throw new Error("Session composer not visible");
    await sessionComposer.fill("What is the function of the proximal convoluted tubule?");
    await page.locator('button:has-text("Send")').click();
    await page.waitForTimeout(500);
    const msg = page.locator("text=What is the function of the proximal convoluted tubule?").first();
    if (!(await msg.isVisible())) throw new Error("User message not visible in transcript");
  });

  await step("go back to home", async () => {
    await page.goBack();
    await page.waitForLoadState("networkidle");
    if (page.url() !== BASE + "/") throw new Error(`Expected home URL, got ${page.url()}`);
  });

  await step("navigate to library and back", async () => {
    const hamburger = page.locator('button:has-text("Open sidebar")');
    await hamburger.click();
    await page.waitForTimeout(200);
    await page.locator('a:has-text("Library")').click();
    await page.waitForLoadState("networkidle");
    if (page.url() !== BASE + "/library") throw new Error(`Expected /library, got ${page.url()}`);
    await page.goBack();
    await page.waitForLoadState("networkidle");
    if (page.url() !== BASE + "/") throw new Error(`Expected home URL, got ${page.url()}`);
  });

  await step("reload on session URL", async () => {
    const composer = page.locator('button:has-text("Start session")');
    await composer.click();
    await page.waitForTimeout(200);
    const coursePicker = page.locator('button:has-text("Choose a course")');
    await coursePicker.click();
    await page.waitForTimeout(200);
    const firstCourse = page.locator("option").first();
    await firstCourse.click();
    await page.waitForTimeout(200);
    const textarea = page.locator('input[placeholder*="what do you want to learn"], textarea[placeholder*="what do you want to learn"]');
    await textarea.fill("Reload test");
    await page.locator('button:has-text("Send")').click();
    await page.waitForLoadState("networkidle");
    const sessionUrl = page.url();
    if (!/\/sessions\//.test(sessionUrl)) throw new Error(`Expected session URL, got ${sessionUrl}`);
    await page.reload();
    await page.waitForLoadState("networkidle");
    if (page.url() !== sessionUrl) throw new Error(`Expected ${sessionUrl}, got ${page.url()}`);
    const reloaded = page.locator("text=Reload test").first();
    if (!(await reloaded.isVisible())) throw new Error("Reloaded transcript message not visible");
  });

  if (errors.length > 0) {
    throw new Error(`Console errors: ${errors.join(", ")}`);
  }
  if (failedStep) {
    throw new Error(failedStep);
  }

  await browser.close();
}

test("interaction check at 360px", async () => {
  await runInteractionTest({ width: 360, height: 800 }, "360px");
});

test("interaction check at 1280px", async () => {
  await runInteractionTest({ width: 1280, height: 800 }, "1280px");
});
