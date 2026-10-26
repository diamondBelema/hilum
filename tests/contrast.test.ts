import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../src/ui/tokens.css"), "utf8");

function tokens(): Map<string, { light: string; dark: string }> {
  const map = new Map<string, { light: string; dark: string }>();
  const pattern = /--([\w-]+):\s*light-dark\(#([0-9a-fA-F]{6}),\s*#([0-9a-fA-F]{6})\)/g;
  for (const match of css.matchAll(pattern)) {
    map.set(match[1]!, { light: match[2]!, dark: match[3]! });
  }
  return map;
}

function luminance(hex: string): number {
  const channels = [0, 2, 4].map((index) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const pairs: [string, string, number][] = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text-muted", "bg", 4.5],
  ["text-muted", "surface", 4.5],
  ["primary", "surface", 4.5],
  ["primary", "bg", 4.5],
  ["on-primary", "primary", 4.5],
  ["accent", "surface", 4.5],
  ["correct", "surface", 4.5],
  ["incorrect", "surface", 4.5],
  ["warning", "surface", 4.5],
  ["correct", "correct-soft", 4.5],
  ["incorrect", "incorrect-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["accent", "accent-soft", 4.5],
  ["text", "primary-soft", 4.5],
  ["text", "surface-2", 4.5],
  ["text-muted", "surface-2", 4.5],
  ["border-strong", "surface", 3],
  ["border-strong", "bg", 3],
  ["focus", "surface", 3],
];

describe("design token contrast", () => {
  const map = tokens();

  test("tokens define both themes", () => {
    expect(map.size).toBeGreaterThan(15);
    const names = new Set<string>();
    for (const [fg, bg] of pairs) {
      names.add(fg);
      names.add(bg);
    }
    for (const name of names) {
      expect(map.has(name), `missing token ${name}`).toBe(true);
    }
  });

  for (const [fg, bg, minimum] of pairs) {
    test(`${fg} on ${bg} meets ${minimum}:1 in both themes`, () => {
      const front = map.get(fg);
      const back = map.get(bg);
      expect(front).toBeDefined();
      expect(back).toBeDefined();
      const light = contrast(front!.light, back!.light);
      const dark = contrast(front!.dark, back!.dark);
      expect(light, `light ${light.toFixed(2)}`).toBeGreaterThanOrEqual(minimum);
      expect(dark, `dark ${dark.toFixed(2)}`).toBeGreaterThanOrEqual(minimum);
    });
  }
});
