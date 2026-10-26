import { realpathSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";

export class VaultPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultPathError";
  }
}

export function normalizeRel(input: string): string {
  if (!input || typeof input !== "string") throw new VaultPathError("path is required");
  if (input.includes("\0")) throw new VaultPathError("path contains a null byte");
  if (isAbsolute(input)) throw new VaultPathError("absolute paths are not allowed");

  const cleaned = normalize(input.replaceAll("\\", "/"));
  if (cleaned === "." || cleaned === "") throw new VaultPathError("path is empty");
  if (cleaned === ".." || cleaned.startsWith(`..${sep}`)) {
    throw new VaultPathError("path traversal is not allowed");
  }
  return cleaned.split(sep).join("/");
}

export function resolveInside(root: string, rel: string): string {
  const safeRel = normalizeRel(rel);
  const target = join(root, safeRel);
  if (!isInside(root, target)) throw new VaultPathError("path escapes the vault");

  const existing = realpathOrNull(target);
  if (existing && !isInside(root, existing)) {
    throw new VaultPathError("path escapes the vault through a symlink");
  }

  const parent = realpathOrNull(dirname(target));
  if (parent && !isInside(root, parent)) {
    throw new VaultPathError("path escapes the vault through a symlink");
  }

  return target;
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function courseFromPath(rel: string): string | null {
  const parts = rel.split("/");
  if (parts[0] === "courses" && parts.length > 2) return parts[1] ?? null;
  return null;
}
