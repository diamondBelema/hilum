import { existsSync } from "node:fs";
import { paths } from "../src/server/config.ts";

async function ensureUiBuilt() {
  if (process.env.HARNESS_SKIP_BUILD === "1") return;
  if (existsSync(paths.uiIndex) && process.env.HARNESS_FORCE_BUILD !== "1") return;

  console.log("building UI…");
  const { build } = await import("vite");
  await build({ logLevel: "warn" });
}

await ensureUiBuilt();
await import("../src/server/index.ts");
