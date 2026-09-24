import { pathToFileURL } from "node:url";

import { reportStartupFailure, startBot } from "./bootstrap.js";

/**
 * Guarded process entrypoint.
 *
 * Only executes when run directly (`npm run start` / `tsx src/index.ts`).
 * Importing this module has no side effects: it never loads config, never
 * creates a gateway, never registers commands, and never logs in. Command
 * registration is the explicit `src/register-commands.ts` path, never part
 * of startup.
 */

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  void startBot().then(undefined, () => {
    reportStartupFailure();
  });
}
