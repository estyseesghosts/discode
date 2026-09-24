import { pathToFileURL } from "node:url";

import type { AppConfig, Environment } from "./config.js";
import { loadConfig } from "./config.js";
import {
  createDiscordRest,
  registerProjectCommands,
  type CommandRest,
} from "./discord/commands.js";

/**
 * Explicit command-registration deployment entrypoint.
 *
 * Loads validated environment configuration, builds a real Discord REST
 * boundary, and registers the global `/project` + `/run` payload exactly
 * once. Importing this module has no side effects: nothing is sent to
 * Discord on import, and the bot startup path (`src/index.ts`) never calls
 * this. Run via `npm run register-commands` when command definitions change.
 */

/** Injectable collaborators for {@link runCommandRegistration}. */
export interface RegisterCommandsDependencies {
  /** Environment to load (defaults to `process.env`). */
  env?: Environment;
  /** Config loader (defaults to {@link loadConfig}). */
  loadConfigFn?: (env: Environment) => AppConfig;
  /** REST factory (defaults to {@link createDiscordRest}). */
  createRest?: (token: string) => CommandRest;
  /** Registration function (defaults to {@link registerProjectCommands}). */
  registerFn?: typeof registerProjectCommands;
}

/**
 * Register the global application commands exactly once.
 * Throws the original error for the entrypoint to report generically.
 */
export async function runCommandRegistration(
  dependencies: RegisterCommandsDependencies = {},
): Promise<void> {
  const env = dependencies.env ?? process.env;
  const config = (dependencies.loadConfigFn ?? loadConfig)(env);
  const rest = (dependencies.createRest ?? createDiscordRest)(
    config.discordToken,
  );
  await (dependencies.registerFn ?? registerProjectCommands)({
    rest,
    clientId: config.discordClientId,
  });
}

/**
 * Sanitized top-level failure reporter for the registration entrypoint.
 *
 * Logs only a generic message and sets a non-zero exit code. Never logs the
 * error, its cause, tokens, or config values.
 */
export function reportRegistrationFailure(): void {
  console.error("Failed to register Discord commands.");
  process.exitCode = 1;
}

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
  void runCommandRegistration().then(undefined, () => {
    reportRegistrationFailure();
  });
}
