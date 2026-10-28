#!/usr/bin/env bun
// Daily database backup job.
//
// Makes a consistent copy of the SQLite database (including WAL contents),
// verifies the copy opens and passes an integrity check, counts key rows, and
// prunes old copies. Runs independently of the server so it can be scheduled
// (systemd user timer or cron) to back up attempts, grades and evidence that
// cannot be rebuilt from the vault.
//
// Usage:
//   bun run scripts/copy-db.ts
//   bun run scripts/copy-db.ts --db ~/.local/share/hilum/app.db --dir ~/hilum-backups --keep 14

import { Database } from "bun:sqlite";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

function parseArgs(argv: string[]): { db: string; dir: string; keep: number } {
  let db = "state/app.db";
  let dir = "state/backups";
  let keep = 14;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--db") db = argv[++i] ?? db;
    else if (argv[i] === "--dir") dir = argv[++i] ?? dir;
    else if (argv[i] === "--keep") keep = Math.max(1, Number(argv[++i] ?? keep));
  }
  return { db, dir, keep };
}

function count(db: Database, table: string): number | null {
  try {
    const row = db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number } | null;
    return row?.n ?? 0;
  } catch {
    return null;
  }
}

async function main() {
  const { db, dir, keep } = parseArgs(Bun.argv.slice(2));
  const repoRoot = join(import.meta.dir, "..");
  const dbPath = resolve(repoRoot, db);
  const backupDir = resolve(repoRoot, dir);

  try {
    await stat(dbPath);
  } catch {
    console.error(`database not found: ${dbPath}`);
    process.exit(1);
  }

  await mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(backupDir, `app-${stamp}.db`);

  const source = new Database(dbPath, { readonly: true });
  try {
    source.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`);
  } finally {
    source.close();
  }

  // Restore test: open the copy, check integrity and counts.
  const copy = new Database(dest, { readonly: true });
  try {
    const integrity = copy.query("PRAGMA integrity_check").get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") {
      throw new Error(`integrity check failed: ${integrity.integrity_check}`);
    }
    const counts = Object.fromEntries(
      ["notes", "questions", "papers", "attempts", "grades", "evidence", "sessions", "real_results"]
        .map((table) => [table, count(copy, table)])
        .filter(([, value]) => value !== null),
    );
    console.log(`backup ok: ${dest}`);
    console.log(`restore test: integrity=ok ${JSON.stringify(counts)}`);
  } finally {
    copy.close();
  }

  const files = (await readdir(backupDir))
    .filter((name) => /^app-.*\.db$/.test(name))
    .sort();
  const stale = files.slice(0, Math.max(0, files.length - keep));
  for (const name of stale) await unlink(join(backupDir, name)).catch(() => {});
  console.log(`kept ${Math.min(files.length, keep)} of ${files.length} copies in ${backupDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
