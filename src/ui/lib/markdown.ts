export type TocItem = { id: string; title: string; level: 2 | 3 };

const HEADING = /^(#{2,3})\s+(.+?)\s*(?:\{#([\w-]+)\})?\s*$/;

export function parseToc(body: string): TocItem[] {
  const items: TocItem[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    const title = match[2] ?? "";
    const id = match[3] ?? slug(title);
    items.push({ id, title, level: match[1] === "##" ? 2 : 3 });
  }
  return items;
}

export function stripLeadingH1(body: string): string {
  return body.replace(/^\s*#\s+.*(?:\n+|$)/, "");
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
