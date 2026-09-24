import type { AppConfig } from "../config.js";
import { BindingStore } from "../bindings/store.js";
import {
  createOpenCodeClient,
  type OpenCodeMake,
  type SessionCapableClient,
} from "../opencode/client.js";
import {
  consumeOpenCodeEvents,
  type EventCapableClient,
  type EventConsumerResult,
  type OpenCodeEvent,
} from "../opencode/events.js";
import {
  forwardMessage,
  type ForwardableMessage,
} from "../discord/message-forwarding.js";
import {
  handleProjectAttach,
  type InteractionOutcome,
} from "../discord/interactions.js";
import { handleRunNew } from "../discord/run-new.js";
import { ingestOpenCodeEvent } from "./run-state.js";
import { RunRegistry } from "./run-registry.js";

/**
 * Runtime composition boundary.
 *
 * Owns exactly one {@link BindingStore}, one {@link RunRegistry}, and one
 * shared OpenCode client created by `createOpenCodeClient(config)`. Wires a
 * single Discord `interactionCreate` listener (project/run command routing),
 * a single `messageCreate` listener (normal-message forwarding through the
 * shared client), and exactly one global OpenCode event consumer whose
 * handler feeds events into the run-registry reducer. Never creates
 * per-channel clients or listeners; no network I/O happens at construction.
 */

/** Minimal Discord gateway shape the runtime needs. No network at rest. */
export interface DiscordGateway {
  on(
    event: "interactionCreate" | "messageCreate",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (value: any) => unknown,
  ): unknown;
  off(
    event: "interactionCreate" | "messageCreate",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (value: any) => unknown,
  ): unknown;
  login(token: string): Promise<unknown>;
}

/**
 * Shared OpenCode client surface the runtime needs: session operations for
 * `/run new` and message forwarding, plus the event stream for the single
 * global consumer. Satisfied by the native client; tests inject a mock via
 * the `makeClient` factory.
 */
export type AppOpenCodeClient = SessionCapableClient & EventCapableClient;

/** Injectable event-consumer loop (defaults to {@link consumeOpenCodeEvents}). */
export type EventConsumerLoop = typeof consumeOpenCodeEvents;

export interface CreateAppOptions {
  /** Discord gateway (real client or test mock). Never logged in by `createApp`. */
  gateway: DiscordGateway;
  /** Injectable native-client factory (defaults to `OpenCode.make`). */
  makeClient?: OpenCodeMake;
  /** Injectable event loop (defaults to {@link consumeOpenCodeEvents}). */
  consumeEvents?: EventConsumerLoop;
}

/** State returned when {@link AppRuntime.start} completes login. */
export interface AppStartResult {
  /** Opaque result of `gateway.login()`. */
  loginResult: unknown;
  /** Resolves when the one finite event stream completes. */
  eventsDone: Promise<EventConsumerResult>;
}

function requireGateway(gateway: DiscordGateway): void {
  if (
    !gateway ||
    typeof gateway.on !== "function" ||
    typeof gateway.off !== "function" ||
    typeof gateway.login !== "function"
  ) {
    throw new Error("A Discord gateway with on/off/login support is required");
  }
}

function requireConfig(config: AppConfig): void {
  if (
    !config ||
    !config.discordToken?.trim() ||
    !config.discordClientId?.trim() ||
    !config.opencodeUrl?.trim()
  ) {
    throw new Error("A validated AppConfig is required");
  }
}

export class AppRuntime {
  readonly config: AppConfig;
  readonly bindings = new BindingStore();
  readonly runs = new RunRegistry();
  readonly opencode: AppOpenCodeClient;
  readonly gateway: DiscordGateway;

  private readonly consumeEvents: EventConsumerLoop;
  private started = false;

  /** Resolves when the one global event stream completes (set by `start()`). */
  eventsDone: Promise<EventConsumerResult> | undefined;

  private readonly interactionListener = (
    interaction: Parameters<Parameters<DiscordGateway["on"]>[1]>[0],
  ): Promise<InteractionOutcome> => this.handleInteraction(interaction);

  private readonly messageListener = (
    message: ForwardableMessage,
  ): Promise<unknown> => this.handleMessage(message);

  constructor(config: AppConfig, options: CreateAppOptions) {
    requireConfig(config);
    if (!options) {
      throw new Error("A Discord gateway with on/off/login support is required");
    }
    requireGateway(options.gateway);
    this.config = config;
    this.gateway = options.gateway;
    this.consumeEvents = options.consumeEvents ?? consumeOpenCodeEvents;
    // The one shared client for every channel/thread, built from config.
    this.opencode = createOpenCodeClient(
      config,
      options.makeClient,
    ) as unknown as AppOpenCodeClient;
  }

  /** Whether `start()` has registered listeners and begun the event loop. */
  get isStarted(): boolean {
    return this.started;
  }

  /**
   * Route one chat-input interaction to `/project attach` then `/run new`.
   *
   * Newly created root sessions are registered in the shared run registry
   * (via the optional registrar on `handleRunNew`) before channel selection.
   * Unrelated interactions are ignored without replying. Never throws for
   * routing or reply conditions — failures are isolated so one bad
   * interaction cannot break the gateway listener.
   */
  async handleInteraction(
    interaction: Parameters<Parameters<DiscordGateway["on"]>[1]>[0],
  ): Promise<InteractionOutcome> {
    try {
      const projectOutcome = await handleProjectAttach(
        interaction,
        this.bindings,
      );
      if (projectOutcome === "handled") {
        return "handled";
      }
    } catch {
      return "handled";
    }
    try {
      return await handleRunNew(
        interaction,
        this.bindings,
        this.opencode,
        this.runs,
      );
    } catch {
      return "handled";
    }
  }

  /**
   * Forward one normal message through the shared client.
   *
   * Returns the forwarding outcome; never throws for routing or delivery
   * conditions so one bad message cannot break the gateway listener.
   */
  async handleMessage(message: ForwardableMessage): Promise<string> {
    try {
      return await forwardMessage(message, this.bindings, this.opencode);
    } catch {
      return "ignored";
    }
  }

  /**
   * Start the runtime: register exactly one interaction listener and one
   * message listener, begin exactly one global OpenCode event consumer whose
   * handler reduces events into the shared run registry, then log the
   * gateway in. No per-channel clients or listeners are created.
   *
   * Resolves after `login()` with `{ loginResult, eventsDone }`, where
   * `eventsDone` settles when the (finite in tests) event stream completes.
   * A later event-stream failure rejects `eventsDone` but never `start()`
   * itself after login has succeeded.
   *
   * Startup failures are cleaned up and rethrown: if the event consumer
   * cannot be established, `login()` is never called; if `login()` rejects,
   * the consumer is aborted via its `AbortSignal`. In both cases both
   * listeners are removed, `eventsDone` resets to `undefined`, and
   * `isStarted` resets so a later `start()` can retry.
   */
  async start(): Promise<AppStartResult> {
    if (this.started) {
      throw new Error("The runtime has already started");
    }
    this.gateway.on("interactionCreate", this.interactionListener);
    this.gateway.on("messageCreate", this.messageListener);
    this.started = true;

    const handler = (event: OpenCodeEvent): void => {
      ingestOpenCodeEvent(this.runs, event);
    };
    const abort = new AbortController();
    let consumer: Promise<EventConsumerResult>;
    try {
      consumer = this.consumeEvents(this.opencode, handler, {
        signal: abort.signal,
      });
    } catch (error) {
      this.cleanupAfterFailedStart();
      throw error;
    }
    // Observe the single consumer immediately so its rejection (for example
    // a stream failure racing Discord login) never surfaces as an unhandled
    // rejection while `start()` awaits `login()`. The derived branch
    // resolves quietly; the public `eventsDone` promise still rejects for
    // callers/tests that await it.
    this.eventsDone = consumer;
    void this.eventsDone.then(undefined, () => undefined);

    let loginResult: unknown;
    try {
      loginResult = await this.gateway.login(this.config.discordToken);
    } catch (error) {
      abort.abort();
      this.cleanupAfterFailedStart();
      throw error;
    }
    return { loginResult, eventsDone: this.eventsDone };
  }

  /**
   * Remove both Discord listeners, drop any stale event-consumer promise,
   * and allow a later `start()` retry. Resetting `eventsDone` does not
   * detach the already-attached rejection observer on the prior promise —
   * that observer lives on the promise object itself — it only prevents a
   * retry from exposing a previous attempt's promise. Never throws: cleanup
   * must not mask the original startup failure.
   */
  private cleanupAfterFailedStart(): void {
    try {
      this.gateway.off("interactionCreate", this.interactionListener);
    } catch {
      // Ignore: cleanup must not mask the original startup failure.
    }
    try {
      this.gateway.off("messageCreate", this.messageListener);
    } catch {
      // Ignore: cleanup must not mask the original startup failure.
    }
    this.eventsDone = undefined;
    this.started = false;
  }
}

/**
 * Compose one runtime from validated config and a Discord gateway.
 * Performs no network I/O — use `start()` to attach listeners, begin the
 * single event consumer, and log in.
 */
export function createApp(
  config: AppConfig,
  options: CreateAppOptions,
): AppRuntime {
  return new AppRuntime(config, options);
}
