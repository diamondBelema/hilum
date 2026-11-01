import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultService } from "../vault/service.ts";
import { resolveInside, slug } from "../vault/paths.ts";

export type Cite = { note: string; anchor?: string; quote?: string };

export class CitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CitationError";
  }
}

type Section = { id: string; title: string; level: number; start: number; end: number; text: string };

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

function sections(body: string): Section[] {
  const lines = body.split("\n");
  const heads: { id: string; title: string; start: number; level: number }[] = [];
  let offset = 0;
  let fenced = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = fenced ? null : HEADING.exec(line);
    if (match) {
      const raw = match[2] ?? "";
      const explicit = /\s*\{#([\w-]+)\}\s*$/.exec(raw);
      const title = explicit ? raw.replace(/\s*\{#[\w-]+\}\s*$/, "") : raw;
      heads.push({
        id: explicit?.[1] ?? slug(title),
        title,
        start: offset,
        level: (match[1] ?? "#").length,
      });
    }
    offset += line.length + 1;
  }

  return heads.map((head, index) => {
    let end = body.length;
    for (let next = index + 1; next < heads.length; next++) {
      if ((heads[next]?.level ?? 0) <= head.level) {
        end = heads[next]?.start ?? body.length;
        break;
      }
    }
    return {
      id: head.id,
      title: head.title,
      level: head.level,
      start: head.start,
      end,
      text: body.slice(head.start, end),
    };
  });
}

export function listSections(body: string, levels = [2, 3]): { id: string; title: string; level: number }[] {
  return sections(body)
    .filter((section) => levels.includes(section.level))
    .map(({ id, title, level }) => ({ id, title, level }));
}

export function normalizeQuote(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function resolveCitePath(vault: VaultService, note: string): string {
  const clean = note.trim();
  if (!clean) throw new CitationError("citation note is empty");
  const candidates = clean.startsWith("courses/") ? [clean] : [clean, `courses/${clean}`];
  for (const candidate of candidates) {
    try {
      resolveInside(vault.root, candidate);
    } catch {
      continue;
    }
    if (existsSync(join(vault.root, candidate)) && candidate.endsWith(".md")) return candidate;
  }
  throw new CitationError(`citation source not found: ${clean}`);
}

export function validateCite(vault: VaultService, cite: Cite): string {
  const path = resolveCitePath(vault, cite.note);
  const body = readFileSync(join(vault.root, path), "utf8");
  const quote = cite.quote ? normalizeQuote(cite.quote) : "";
  const anchor = cite.anchor?.replace(/^#/, "").trim();

  if (!anchor && !quote) {
    throw new CitationError(`citation needs an anchor or quote: ${cite.note}`);
  }

  const noteSections = sections(body);
  let haystack = normalizeQuote(body);

  if (anchor) {
    const section = noteSections.find((item) => item.id === anchor);
    if (!section) {
      throw new CitationError(`anchor not found in ${cite.note}: ${anchor}`);
    }
    haystack = normalizeQuote(section.text);
  }

  if (quote && !haystack.includes(quote)) {
    throw new CitationError(
      `quote not found in ${cite.note}${anchor ? `#${anchor}` : ""}: "${cite.quote}"`,
    );
  }

  return path;
}

export function validateCites(
  vault: VaultService,
  cites: Cite[] | undefined,
  options: { requireQuote?: boolean } = {},
): Cite[] {
  if (!cites || cites.length === 0) {
    throw new CitationError("at least one citation is required");
  }
  const normalized: Cite[] = [];
  for (const cite of cites) {
    const path = validateCite(vault, cite);
    const quote = cite.quote?.trim();
    normalized.push({
      note: path,
      anchor: cite.anchor?.replace(/^#/, "").trim() || undefined,
      quote: quote || undefined,
    });
  }
  if (options.requireQuote && !normalized.some((cite) => cite.quote)) {
    throw new CitationError("banked items need at least one citation with a quote");
  }
  return normalized;
}
