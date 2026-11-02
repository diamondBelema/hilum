#!/usr/bin/env bun

// Canonical database backup entry point. Keep copy-db.ts as a compatibility
// alias for existing schedules and documentation.
import { main } from "./copy-db.ts";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
