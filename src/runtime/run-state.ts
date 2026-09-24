import {
  eventDirectory,
  eventSessionId,
  type OpenCodeEvent,
} from "../opencode/events.js";
import type { Run, RunRegistry, RunState } from "./run-registry.js";

/**
 * Semantic event reduction for known root runs.
 *
 * Pure mapping plus a thin synchronous ingestion helper. This module never
 * touches Discord, never persists anything, never starts subscriptions, and
 * never auto-discovers unknown sessions: a session becomes known only via
 * explicit {@link RunRegistry.registerRoot} or by indexing a child whose
 * `data.parentID` points at an already-known run.
 */

/** How {@link ingestOpenCodeEvent} resolved (or ignored) an event. */
export type IngestStatus = "updated" | "ignored";

/** Reason codes for ingest outcomes. Payload-free by construction. */
export type IngestReason =
  | "known-session"
  | "child-indexed"
  | "directory-match"
  | "unknown-session"
  | "unknown-parent"
  | "ambiguous-directory"
  | "unmatched-directory"
  | "no-context"
  | "malformed-event";

/** Payload-free outcome of ingesting one event. Never retains event data. */
export interface IngestOutcome {
  readonly status: IngestStatus;
  readonly reason: IngestReason;
  /** Defensive copy of the affected root run when `status` is `"updated"`. */
  readonly run?: Run;
}

/**
 * Reduce one event type to the next run state.
 *
 * Total over events: unknown, missing, or malformed event shapes leave the
 * previous state unchanged and never throw. `previous` must be a valid
 * {@link RunState}; programmer errors there throw.
 *
 * Mapping (minimal states):
 * - `session.idle` -> `idle`;
 * - error-class types (any type containing `error`, case-insensitive) -> `error`;
 * - known activity types (`session.*` besides idle/error, plus `message.*`,
 *   `tool.*`, and `part.*`) -> `working`;
 * - everything else (including `server.*` and unknown types) -> unchanged.
 */
export function reduceRunState(
  previous: RunState,
  event: OpenCodeEvent | null | undefined,
): RunState {
  requirePrevious(previous);
  const type = readEventType(event);
  if (type === undefined) {
    return previous;
  }
  const lowered = type.toLowerCase();
  if (lowered === "session.idle") {
    return "idle";
  }
  if (lowered.includes("error")) {
    return "error";
  }
  if (
    lowered.startsWith("session.") ||
    lowered.startsWith("message.") ||
    lowered.startsWith("tool.") ||
    lowered.startsWith("part.")
  ) {
    return "working";
  }
  return previous;
}

/**
 * Ingest one OpenCode event into a known run, synchronously.
 *
 * Deterministic resolution order:
 * 1. Known event session ID (root or indexed child) wins — even when the
 *    event location contradicts the run's directory.
 * 2. Unknown event session with a known `data.parentID` is indexed as a
 *    child under that parent's root (a parent ID that is itself a known
 *    child resolves to its root, so grandchildren flatten onto the root),
 *    then reduced as that run's event.
 * 3. An event with no session ID but a directory matching exactly one
 *    registered run reduces that run.
 * 4. Otherwise the event is ignored: unknown sessions without a known
 *    parent (even when their directory is unambiguous — directory fallback
 *    applies only to events with no session ID), location/session-less
 *    events, ambiguous directories (multiple runs), unmatched directories
 *    (zero runs), and malformed events.
 *
 * Unknown sessions are never auto-discovered as roots. Outcomes and returned
 * runs are defensive copies containing IDs, state, and fixed reason codes
 * only — never message text or event payloads.
 */
export function ingestOpenCodeEvent(
  registry: RunRegistry,
  event: OpenCodeEvent | null | undefined,
): IngestOutcome {
  if (registry === null || registry === undefined) {
    throw new Error("A run registry is required");
  }
  if (
    typeof registry.runForSession !== "function" ||
    typeof registry.indexChildSession !== "function" ||
    typeof registry.runsInDirectory !== "function" ||
    typeof registry.setState !== "function"
  ) {
    throw new Error("A run registry is required");
  }
  if (event === null || event === undefined || typeof event !== "object") {
    return { status: "ignored", reason: "malformed-event" };
  }

  const sessionId = eventSessionId(event);
  if (sessionId !== undefined) {
    const known = registry.runForSession(sessionId);
    if (known !== undefined) {
      const next = reduceRunState(known.state, event);
      const updated = registry.setState(known.rootSessionId, next);
      return { status: "updated", reason: "known-session", run: updated };
    }

    const parentId = eventParentId(event);
    if (parentId !== undefined) {
      const parent = registry.runForSession(parentId);
      if (parent === undefined) {
        return { status: "ignored", reason: "unknown-parent" };
      }
      const indexed = registry.indexChildSession(
        parent.rootSessionId,
        sessionId,
      );
      const next = reduceRunState(indexed.state, event);
      const updated = registry.setState(indexed.rootSessionId, next);
      return { status: "updated", reason: "child-indexed", run: updated };
    }

    // Unknown session without a known parent: never auto-discover, even when
    // the event carries a directory that matches a registered run.
    return { status: "ignored", reason: "unknown-session" };
  }

  const directory = eventDirectory(event);
  if (directory === undefined) {
    return { status: "ignored", reason: "no-context" };
  }
  const candidates = registry.runsInDirectory(directory);
  if (candidates.length !== 1 || candidates[0] === undefined) {
    return {
      status: "ignored",
      reason:
        candidates.length === 0 ? "unmatched-directory" : "ambiguous-directory",
    };
  }
  const target = candidates[0];
  const next = reduceRunState(target.state, event);
  const updated = registry.setState(target.rootSessionId, next);
  return { status: "updated", reason: "directory-match", run: updated };
}

/**
 * Extract a parent session ID from an event, if it carries one.
 *
 * Reads `data.parentID` first (the OpenCode V2 child-session shape), then
 * `data.parentId`. Returns undefined for missing, blank, or non-string
 * values instead of throwing. Never returns payload data.
 */
export function eventParentId(
  event: OpenCodeEvent | null | undefined,
): string | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }
  const data = event.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = data as { readonly [key: string]: unknown };
  const raw = record["parentID"] ?? record["parentId"];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function readEventType(
  event: OpenCodeEvent | null | undefined,
): string | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }
  const raw: unknown = (event as { readonly type?: unknown }).type;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function requirePrevious(previous: RunState): void {
  if (previous !== "idle" && previous !== "working" && previous !== "error") {
    throw new Error("Previous run state must be one of idle, working, error");
  }
}
