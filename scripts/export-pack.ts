#!/usr/bin/env bun
// Offline study-pack export.
//
// Exports the vault (course notes, concepts, banked activities, indexes) plus
// a database snapshot into a static bundle directory that can be served offline.
//
// Usage:
//   bun run scripts/export-pack.ts                 # default: vault -> .study-pack
//   bun run scripts/export-pack.ts --out /tmp/pack

import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

function parseArgs(argv: string[]): { out: string } {
  let out = ".study-pack";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
  }
  return { out };
}

async function copyDir(src: string, dest: string): Promise<number> {
  await mkdir(dest, { recursive: true });
  let count = 0;
  const entries = await readdir(src);
  for (const name of entries) {
    const s = join(src, name);
    const d = join(dest, name);
    const st = await stat(s);
    if (st.isDirectory()) {
      count += await copyDir(s, d);
    } else {
      await copyFile(s, d);
      count++;
    }
  }
  return count;
}

async function main() {
  const { out } = parseArgs(Bun.argv.slice(2));
  const repoRoot = join(import.meta.dir, "..");
  const outDir = out.startsWith("/") ? out : join(repoRoot, out);
  const vault = join(repoRoot, "vault");

  try {
    await stat(vault);
  } catch {
    console.error(`vault not found: ${vault}`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  // Export the whole vault (notes, concepts, activities, indexes, assets).
  const files = await copyDir(vault, join(outDir, "vault"));

  // Snapshot the database.
  const db = join(repoRoot, "state/app.db");
  let dbFiles = 0;
  for (const sidecar of ["", "-wal", "-shm"]) {
    const src = db + sidecar;
    try {
      await stat(src);
      await copyFile(src, join(outDir, `app.db${sidecar}`));
      dbFiles++;
    } catch {
      // ignore missing sidecars
    }
  }

  // README inside the pack so it's self-describing.
  const packReadme = `# Exam Harness — Offline Study Pack

Generated ${new Date().toISOString()}.

Contents:
- vault/ — course notes, concepts, banked activities and indexes (markdown).
- app.db* — SQLite snapshot (attempts, grades, evidence, mastery).

The pack is read-only. Study offline, then sync results back when the server is running.
`;
  await Bun.write(join(outDir, "README.md"), packReadme);

  console.log(
    `study pack at ${outDir}: ${files} vault files + ${dbFiles} db file(s)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
