import type { AppConfig, Environment } from "./config.js";
import { loadConfig } from "./config.js";
import { createDiscordClient } from "./discord/client.js";
import {
  createApp,
  type AppRuntime,
  type DiscordGateway,
  type EventConsumerLoop,
} from "./runtime/app.js";
import type { OpenCodeMake } from "./opencode/client.js";
import type { EventConsumerResult } from "./opencode/events.js";

/**
 * Testable process-bootstrap boundary.
 *
 * `startBot` loads validated environment configuration, builds the real
 * Discord gateway, composes the runtime via `createApp`, and starts it. It
 * never registers Discord commands (registration is the explicit
 * `src/register-commands.ts` deployment path) and never logs secrets or raw
 * failure causes — top-level reporting is the caller's job via
 * {@link reportStartupFailure}.
 */

/** Injectable collaborators for {@link startBot}. All optional in tests. */
export interface StartBotDependencies {
  /** Environment to load (defaults to `process.env`). */
  env?: Environment;
  /** Config loader (defaults to {@link loadConfig}). */
  loadConfigFn?: (env: Environment) => AppConfig;
  /** Discord gateway factory (defaults to {@link createDiscordClient}). */
  createGateway?: () => DiscordGateway;
  /** Runtime factory (defaults to {@link createApp}). */
  createAppFn?: typeof createApp;
  /** Injected OpenCode client factory, forwarded to `createApp`. */
  makeClient?: OpenCodeMake;
  /** Injected event-consumer loop, forwarded to `createApp`. */
  consumeEvents?: EventConsumerLoop;
}

/** State returned when {@link startBot} completes Discord login. */
export interface StartBotResult {
  /** The started runtime. */
  app: AppRuntime;
  /** Opaque result of `gateway.login()`. */
  loginResult: unknown;
  /** Settles when the one global event stream completes. */
  eventsDone: Promise<EventConsumerResult>;
}

/**
 * Load config, create the gateway, compose the runtime, and start it.
 *
 * Attaches a safe rejection observer to `eventsDone` so a later event-stream
 * failure never surfaces as an unhandled rejection in the long-lived
 * process; callers can still await `eventsDone` to observe the failure.
 * Throws the original error for the entrypoint to report generically.
 */
export async function startBot(
  dependencies: StartBotDependencies = {},
): Promise<StartBotResult> {
  const env = dependencies.env ?? process.env;
  const config = (dependencies.loadConfigFn ?? loadConfig)(env);
  const gateway = (dependencies.createGateway ?? createDiscordClient)();
  const app = (dependencies.createAppFn ?? createApp)(config, {
    gateway,
    makeClient: dependencies.makeClient,
    consumeEvents: dependencies.consumeEvents,
  });
  const { loginResult, eventsDone } = await app.start();
  // Safe observer for the long-lived process: the derived branch resolves
  // quietly while the public `eventsDone` promise still rejects for
  // observers that await it.
  void eventsDone.then(undefined, () => undefined);
  return { app, loginResult, eventsDone };
}

/**
 * Sanitized top-level failure reporter for the process entrypoint.
 *
 * Logs only a generic message and sets a non-zero exit code. Never logs the
 * error, its cause, tokens, or config values.
 */
export function reportStartupFailure(): void {
  console.error("Failed to start the Discord bridge.");
  process.exitCode = 1;
}
