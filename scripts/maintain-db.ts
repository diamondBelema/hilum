import { Database } from "bun:sqlite";
import { statfs, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../src/server/config.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function human(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function directorySize(path: string): number | null {
  const result = spawnSync("du", ["-sb", path], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const value = Number(result.stdout.split("\t")[0]);
  return Number.isFinite(value) ? value : null;
}

const config = loadConfig();
const dbPath = arg("--db") ?? process.env.HARNESS_DB ?? config.dbPath;
const vaultPath = arg("--vault") ?? config.vaultPath;

const db = new Database(dbPath);
const checkpoint = db.query("PRAGMA wal_checkpoint(TRUNCATE)").get() as {
  busy: number;
  log: number;
  checkpointed: number;
};
db.exec("VACUUM");
db.exec("PRAGMA optimize");
db.close();

const dbSize = (await stat(dbPath)).size;
const walSize = await stat(`${dbPath}-wal`).then(
  (value) => value.size,
  () => 0,
);
const vaultSize = directorySize(vaultPath);
const disk = await statfs(dirname(dbPath));
const totalBytes = disk.blocks * disk.bsize;
const freeBytes = disk.bavail * disk.bsize;

console.log(`maintenance ok: ${dbPath}`);
console.log(
  `checkpoint: busy=${checkpoint.busy} log=${checkpoint.log} checkpointed=${checkpoint.checkpointed}`,
);
console.log(`database: ${human(dbSize)} (WAL ${human(walSize)})`);
console.log(
  `vault: ${vaultSize === null ? "unknown" : human(vaultSize)} at ${vaultPath}`,
);
console.log(
  `disk: ${human(freeBytes)} free of ${human(totalBytes)} (${((freeBytes / totalBytes) * 100).toFixed(1)}%)`,
);
