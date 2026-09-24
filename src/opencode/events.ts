import { OpenCodeError } from "./client.js";
import type { SharedOpenCodeClient } from "./client.js";

/**
 * Global OpenCode event consumer boundary.
 *
 * One consumer subscribes to the shared OpenCode event stream exactly once
 * and passes each event to one injected handler. This module never creates
 * an OpenCode client, never creates per-channel listeners, and never assumes
 * every event carries a location — later routing inspects the preserved
 * event object (see {@link eventSessionId} and {@link eventDirectory}).
 * Error messages carry counts and routing context only; raw event payloads
 * and prompt text are never logged or echoed here.
 */

/** Minimal location shape preserved from OpenCode events. */
export interface OpenCodeEventLocation {
  readonly directory: string;
  readonly [key: string]: unknown;
}

/**
 * Minimal OpenCode event shape this slice needs.
 *
 * `type` is always present; `location` and session context are optional so
 * location-less events (for example `server.connected`) flow through without
 * special-casing. Unknown extra fields are preserved via the index
 * signature for later routing/reducers.
 */
export interface OpenCodeEvent {
  readonly type: string;
  readonly location?: OpenCodeEventLocation | null;
  readonly data?: { readonly [key: string]: unknown } | null;
  readonly [key: string]: unknown;
}

/**
 * Minimal event surface needed from the shared client.
 * Satisfied by the native client; tests inject a mock.
 */
export interface EventCapableClient {
  readonly event: {
    subscribe(options?: {
      readonly signal?: AbortSignal;
    }): AsyncIterable<OpenCodeEvent>;
  };
}

// Compile-time guarantee (emits no runtime code): the native client satisfies
// the minimal structural shape, so production code can pass the shared
// instance wherever an `EventCapableClient` is required.
type AssertTrue<T extends true> = T;
type _NativeClientFitsEvents = AssertTrue<
  SharedOpenCodeClient extends EventCapableClient ? true : false
>;

/** Handles one OpenCode event. May be sync or async. */
export type OpenCodeEventHandler = (
  event: OpenCodeEvent,
) => void | Promise<unknown>;

/** Options for {@link consumeOpenCodeEvents}. */
export interface EventConsumerOptions {
  /** Forwarded to the native `event.subscribe()` call. */
  readonly signal?: AbortSignal;
}

/** Summary returned when the event stream completes normally. */
export interface EventConsumerResult {
  /** How many events the stream yielded (including ones the handler rejected). */
  readonly eventsReceived: number;
  /** How many handler invocations threw or rejected without breaking the stream. */
  readonly handlerFailures: number;
  /** Always true — the result only exists when the stream ended normally. */
  readonly completed: boolean;
}

/**
 * Extract the session ID from an event, if it carries one.
 *
 * Inspects `data.sessionID` first (the OpenCode V2 event shape), then a
 * top-level `sessionID`/`sessionId`. Returns undefined for events without
 * session context instead of throwing. Never includes payload data.
 */
export function eventSessionId(
  event: OpenCodeEvent | null | undefined,
): string | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }
  const fromData =
    event.data && typeof event.data === "object"
      ? (event.data as { readonly sessionID?: unknown }).sessionID
      : undefined;
  const fromTopLevel =
    (event as { readonly sessionID?: unknown }).sessionID ??
    (event as { readonly sessionId?: unknown }).sessionId;
  const raw = fromData ?? fromTopLevel;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Extract the project directory from an event, if it carries one.
 *
 * Inspects `location.directory` (object form) or a bare string `location`.
 * Returns undefined for location-less events instead of throwing.
 */
export function eventDirectory(
  event: OpenCodeEvent | null | undefined,
): string | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }
  const location: unknown = event.location;
  if (typeof location === "string") {
    const trimmed = location.trim();
    return trimmed ? trimmed : undefined;
  }
  if (location && typeof location === "object") {
    const directory = (location as { readonly directory?: unknown })
      .directory;
    if (typeof directory === "string") {
      const trimmed = directory.trim();
      return trimmed ? trimmed : undefined;
    }
  }
  return undefined;
}

/**
 * Consume the one shared OpenCode event stream.
 *
 * Calls `client.event.subscribe()` exactly once, then passes each yielded
 * event — untouched, preserving location/session context — to `handler`.
 * Never creates per-channel listeners or clients.
 *
 * - Stream completion: resolves with an {@link EventConsumerResult} summary.
 * - Handler failure: isolated per event; the failure is counted and the
 *   stream continues. The handler's error is swallowed so event payloads
 *   cannot leak through rejection reasons.
 * - Subscription failure (`subscribe()` itself throws) or stream failure
 *   (the iterable throws mid-consumption): throws {@link OpenCodeError}
 *   with a count-only message and the original cause. Reconnection policy
 *   belongs to the (future) bot wiring, not this boundary.
 */
export async function consumeOpenCodeEvents(
  client: EventCapableClient,
  handler: OpenCodeEventHandler,
  options?: EventConsumerOptions,
): Promise<EventConsumerResult> {
  if (!client || typeof client.event?.subscribe !== "function") {
    throw new OpenCodeError(
      "An OpenCode client with event support is required",
    );
  }
  if (typeof handler !== "function") {
    throw new OpenCodeError("An OpenCode event handler is required");
  }

  let stream: AsyncIterable<OpenCodeEvent>;
  try {
    stream = client.event.subscribe(
      options?.signal ? { signal: options.signal } : undefined,
    );
  } catch (error) {
    throw new OpenCodeError("Could not subscribe to OpenCode events.", {
      cause: error,
    });
  }
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new OpenCodeError("Could not subscribe to OpenCode events.");
  }

  let eventsReceived = 0;
  let handlerFailures = 0;
  try {
    for await (const event of stream) {
      eventsReceived += 1;
      try {
        await handler(event);
      } catch {
        handlerFailures += 1;
      }
    }
  } catch (error) {
    throw new OpenCodeError(
      `OpenCode event stream failed after ${eventsReceived} event(s).`,
      { cause: error },
    );
  }

  return { eventsReceived, handlerFailures, completed: true };
}
