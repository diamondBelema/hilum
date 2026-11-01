import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const target =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  execFileSync("rustc", ["-vV"], { encoding: "utf8" })
    .split("\n")
    .find((line) => line.startsWith("host: "))
    ?.slice("host: ".length)
    .trim();

if (!target) throw new Error("Could not determine the Rust target triple");

mkdirSync("src-tauri/binaries", { recursive: true });
const ext = target.includes("windows") ? ".exe" : "";
const output = join("src-tauri", "binaries", `hilum-server-${target}${ext}`);
const args = ["build", "src/server/index.ts", "--compile", "--outfile", output];
try {
  execFileSync(process.env.BUN ?? "bun", args, { stdio: "inherit" });
} catch (error) {
  if (process.env.BUN) throw error;
  execFileSync("npx", ["--yes", "bun", ...args], { stdio: "inherit" });
}
