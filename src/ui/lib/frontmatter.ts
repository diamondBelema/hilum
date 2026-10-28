import { parse as parseYaml } from "yaml";

export type ParsedNote = {
  frontmatter: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
};

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterError";
  }
}

export function parseNote(raw: string): ParsedNote {
  const normalized = raw.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized, hasFrontmatter: false };
  }

  const closing = /\n---[ \t]*(\n|$)/.exec(normalized.slice(4));
  if (!closing) throw new FrontmatterError("frontmatter is not closed with ---");

  const yamlText = normalized.slice(4, 4 + closing.index);
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FrontmatterError(`invalid YAML frontmatter: ${message}`);
  }

  if (parsed === null || parsed === undefined) parsed = {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FrontmatterError("frontmatter must be a YAML mapping");
  }

  const bodyStart = 4 + closing.index + closing[0].length;
  return {
    frontmatter: parsed as Record<string, unknown>,
    body: normalized.slice(bodyStart),
    hasFrontmatter: true,
  };
}

export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function topicsToString(topics: unknown): string {
  const list = stringList(topics);
  return list.join(", ");
}
