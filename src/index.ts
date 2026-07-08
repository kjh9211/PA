#!/usr/bin/env node
import { main } from "./cli/index.js";

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 2;
});
