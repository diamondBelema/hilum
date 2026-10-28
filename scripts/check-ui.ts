import { chromium } from "playwright";

const base = process.env.HILUM_URL ?? "http://127.0.0.1:4747";
const tabs = ["Study", "Live", "Exams", "Grading", "Notes", "Progress", "Graph"] as const;

type Failure = string;
const failures: Failure[] = [];
const fail = (message: string) => failures.push(message);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 360, height: 800 } });

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main");
  await page.waitForTimeout(1200);

  const nav = page.locator('nav[aria-label="Main"]:visible');

  for (const tab of tabs) {
    await nav.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(500);
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth,
    }));
    if (size.scroll > size.width + 1) fail(`${tab}: horizontal overflow ${size.scroll}/${size.width}`);
  }

  const navInfo = await page.evaluate(() => {
    const element = [...document.querySelectorAll('nav[aria-label="Main"]')].find(
      (node) => node.getBoundingClientRect().width > 0,
    ) as HTMLElement | undefined;
    if (!element) return null;
    const buttons = [...element.querySelectorAll("li > button")] as HTMLElement[];
    const main = document.getElementById("main");
    return {
      labels: buttons.map((button) => button.textContent?.trim() ?? ""),
      fontSizes: buttons.map((button) => getComputedStyle(button).fontSize),
      widths: buttons.map((button) => button.getBoundingClientRect().width),
      overflows: buttons.map((button) => button.scrollWidth > button.clientWidth),
      barHeight: element.getBoundingClientRect().height,
      mainBottomPad: main ? Number.parseFloat(getComputedStyle(main).paddingBottom) : 0,
    };
  });
  if (!navInfo) {
    fail("mobile navigation not found");
  } else {
    if (navInfo.labels.length !== 7) fail(`navigation has ${navInfo.labels.length} destinations`);
    if (navInfo.fontSizes.some((size) => Number.parseFloat(size) < 13)) {
      fail(`navigation labels under 13px: ${navInfo.fontSizes.join(", ")}`);
    }
    if (navInfo.overflows.some(Boolean)) fail("navigation labels overflow their buttons");
    if (navInfo.mainBottomPad < navInfo.barHeight) {
      fail(`main bottom padding ${navInfo.mainBottomPad} < nav height ${navInfo.barHeight}`);
    }
  }

  for (const tab of ["Live", "Notes", "Grading"] as const) {
    await nav.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(400);
    const small = await page.evaluate(() => {
      const found: { label: string; width: number; height: number }[] = [];
      for (const element of document.querySelectorAll(
        'main button, main a, main select, main input, main [role="switch"]',
      )) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.width < 44 || rect.height < 44) {
          found.push({
            label: (element.textContent ?? element.getAttribute("aria-label") ?? "")
              .trim()
              .slice(0, 40),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
      return found;
    });
    for (const item of small) fail(`${tab}: tap target ${item.label} is ${item.width}x${item.height}`);
  }

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("switch", { name: "LAN access" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(200);
  const smallSettings = await page.evaluate(() => {
    const found: { label: string; width: number; height: number }[] = [];
    for (const element of document.querySelectorAll(
      'button, a, select, input, [role="switch"]',
    )) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.width < 44 || rect.height < 44) {
        found.push({
          label: (element.textContent ?? element.getAttribute("aria-label") ?? "")
            .trim()
            .slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
    return found;
  });
  for (const item of smallSettings) {
    fail(`Settings: tap target ${item.label} is ${item.width}x${item.height}`);
  }
  if ((await page.getByRole("switch", { name: "LAN access" }).count()) !== 1) {
    fail("Settings: LAN switch missing");
  }
  const token = await page.locator("code").last().innerText();
  if (!token) fail("Settings: MCP token field missing");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const courses = (await (await fetch(`${base}/api/courses`)).json()) as {
    code: string;
    questions: number;
    concepts: number;
  }[];
  const examsDefault = courses.find((course) => course.questions > 0)?.code ?? courses[0]?.code;
  await nav.getByRole("button", { name: "Exams", exact: true }).click();
  await page.waitForTimeout(700);
  const examSelect = page.locator("main select").first();
  if (examsDefault && (await examSelect.inputValue()) !== examsDefault) {
    fail(`Exams: default course ${await examSelect.inputValue()} should be ${examsDefault}`);
  }

  await nav.getByRole("button", { name: "Progress", exact: true }).click();
  await page.waitForTimeout(700);
  await page.route("**/api/mastery/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.locator("main select").first().selectOption({ index: 1 });
  await page.waitForTimeout(150);
  const switching = await page.evaluate(() => ({
    empty: document.body.textContent?.includes("No topics yet") ?? false,
    skeleton: document.querySelectorAll('[class*="animate-pulse"], .skeleton').length > 0,
  }));
  if (switching.empty) fail("Progress: empty state flashes while switching course");
  if (!switching.skeleton) fail("Progress: no skeleton while switching course");
} finally {
  await browser.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log("ui check ok: 360px tabs, navigation, tap targets, defaults, course switch");
