#!/usr/bin/env bun
// Daily database copy job.
//
// Copies `state/app.db` (and its WAL sidecars) to a timestamped file under
// `state/backups/`. Runs independently of the server so it can be scheduled
// (e.g. cron) to back up attempts, grades and evidence that cannot be rebuilt
// from the vault.
//
// Usage:
//   bun run scripts/copy-db.ts          # default: state/app.db -> state/backups/
//   bun run scripts/copy-db.ts --db state/app.db --dir state/backups

import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

function parseArgs(argv: string[]): { db: string; dir: string } {
  let db = "state/app.db";
  let dir = "state/backups";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--db") db = argv[++i];
    else if (argv[i] === "--dir") dir = argv[++i];
  }
  return { db, dir };
}

async function main() {
  const { db, dir } = parseArgs(Bun.argv.slice(2));
  const repoRoot = join(import.meta.dir, "..");
  const dbPath = join(repoRoot, db);
  const backupDir = join(repoRoot, dir);

  try {
    await stat(dbPath);
  } catch {
    console.error(`database not found: ${dbPath}`);
    process.exit(1);
  }

  await mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sidecars = ["", "-wal", "-shm"];
  let copied = 0;
  for (const sidecar of sidecars) {
    const src = dbPath + sidecar;
    try {
      await stat(src);
      await copyFile(src, join(backupDir, `app-${stamp}.db${sidecar}`));
      copied++;
    } catch {
      // sidecar may not exist (shm/wal absent) — that's fine
    }
  }

  console.log(`copied ${dbPath} -> ${backupDir}/app-${stamp}.db* (${copied} files)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
