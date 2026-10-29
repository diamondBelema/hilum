import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const UI_ROOT = join(import.meta.dir, "../src/ui");

// Files owned by another workstream. Each entry names the person/workstream
// that will remove it once that file is redesigned.
const ALLOWLIST = new Map<string, string>([
  // Reader text size is a user preference, applied inline on purpose.
  ["screens/Reader.tsx", "Library/reader owner"],
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function label(path: string): string {
  return relative(UI_ROOT, path);
}

const checks: { name: string; pattern: RegExp }[] = [
  { name: "arbitrary text size (text-[…])", pattern: /text-\[[^\]]+\]/g },
  { name: "arbitrary font family (font-[…])", pattern: /font-\[[^\]]+\]/g },
  { name: "inline fontFamily", pattern: /fontFamily\s*:/g },
  { name: "inline fontSize", pattern: /fontSize\s*:/g },
  { name: "weight above 600", pattern: /\bfont-(?:bold|extrabold|black)\b/g },
  { name: "opacity modifier on text color", pattern: /\btext-(?:text|text-muted|primary|accent|correct|incorrect|warning|on-primary)\/\d+/g },
];

describe("typography roles", () => {
  const sources = files(UI_ROOT).filter((path) => /\.(tsx?|css)$/.test(path));

  for (const check of checks) {
    test(`no ${check.name} outside the allowlist`, () => {
      const violations: string[] = [];
      for (const path of sources) {
        const key = label(path);
        if (ALLOWLIST.has(key)) continue;
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(check.pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push(`${key}:${line} ${match[0]}`);
        }
      }
      expect(violations).toEqual([]);
    });
  }

  test("type role utilities are defined for the UI and prose faces", () => {
    const css = readFileSync(join(UI_ROOT, "styles.css"), "utf8");
    for (const role of [
      "type-display",
      "type-title",
      "type-heading",
      "type-body",
      "type-body-sm",
      "type-meta",
      "type-label",
      "type-prose",
      "type-code",
    ]) {
      expect(css).toContain(`@utility ${role}`);
    }
    expect(css).toContain("Source Sans 3 Variable");
    expect(css).toContain("JetBrains Mono Variable");
  });

  test("only the Latin variable font files are referenced", () => {
    const css = readFileSync(join(UI_ROOT, "styles.css"), "utf8");
    expect(css).toContain("jetbrains-mono-latin-wght-normal.woff2");
    expect(css).toContain("source-sans-3-latin-wght-normal.woff2");
    expect(css).not.toContain("cyrillic");
    expect(css).not.toContain("greek");
    expect(css).not.toContain("vietnamese");
    expect(css).not.toContain("latin-ext");
    expect(css).not.toContain("@fontsource/jetbrains-mono");
    expect(css).not.toContain("@fontsource/source-sans-3");
  });
});
